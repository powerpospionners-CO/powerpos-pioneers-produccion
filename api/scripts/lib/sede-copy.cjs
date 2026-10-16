const { createHash } = require('node:crypto');
const { Prisma } = require('@prisma/client');
const CONTROL = new Set(['BaseSede','ControlAislamiento','EscrituraEnCurso','SelloBaseSede','ConfiguracionPlanes']);
const modelos = Prisma.dmmf.datamodel.models.filter(m=>!CONTROL.has(m.name));
const q = name => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw Error('Identificador inválido'); return `"${name}"`; };
const campos = model => model.fields.filter(f=>f.kind!=='object');
const relaciones = model => model.fields.filter(f=>f.kind==='object'&&f.relationFromFields?.length);
async function leerModelo(db,model,where={}) {
  const select = campos(model).map(f=>`${q(f.dbName||f.name)}${['Decimal','DateTime','Json','BigInt'].includes(f.type)?'::text':''} AS ${q(f.name)}`).join(',');
  const keys=Object.keys(where);
  const filter=keys.length?' WHERE '+keys.map((key,i)=>`${q(key)}=$${i+1}`).join(' AND '):'';
  const rows=await db.$queryRawUnsafe(`SELECT ${select} FROM ${q(model.dbName||model.name)}${filter} ORDER BY id LIMIT 100001`,...keys.map(key=>where[key]));
  if(rows.length>100000)throw Error('La copia requiere procesamiento por lotes');
  return rows;
}
async function snapshot(db) {
  return db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const result={};let total=0;
    for(const model of modelos){result[model.name]=await leerModelo(tx,model);total+=result[model.name].length;if(total>500000)throw Error('La copia excede el límite verificado');}
    return result;
  },{isolationLevel:'RepeatableRead',timeout:120000});
}
function seleccionar(datos,empresaId,sucursalId) {
  const sedes=datos.Sucursal.filter(s=>s.empresaId===empresaId);
  if(sedes.length!==1||sedes[0].id!==sucursalId)throw Error('La migración inicial exige una única sede por empresa; no se repartirá inventario por inferencia');
  const elegidos=new Map(modelos.map(m=>[m.name,new Map()]));
  const indexes=new Map();
  const parent=(relation,row)=>{
    const key=relation.type+':'+relation.relationToFields.join(',');
    if(!indexes.has(key))indexes.set(key,new Map((datos[relation.type]||[]).map(p=>[JSON.stringify(relation.relationToFields.map(k=>p[k])),p])));
    return indexes.get(key).get(JSON.stringify(relation.relationFromFields.map(k=>row[k])));
  };
  for(const model of modelos)for(const row of datos[model.name]) {
    let incluir=false;
    if(model.name==='Empresa')incluir=row.id===empresaId;
    else if(model.name==='Sucursal')incluir=row.id===sucursalId&&row.empresaId===empresaId;
    else if(model.fields.some(f=>f.name==='empresaId'))incluir=row.empresaId===empresaId&&(row.sucursalId==null||row.sucursalId===sucursalId);
    else if(model.fields.some(f=>f.name==='sucursalId'))incluir=row.sucursalId===sucursalId;
    if(incluir)elegidos.get(model.name).set(row.id,{...row});
  }
  for(let pass=0;pass<modelos.length;pass++){
    let cambios=0;
    for(const model of modelos){
      if(['Empresa','Sucursal'].includes(model.name)||model.fields.some(f=>['empresaId','sucursalId'].includes(f.name)))continue;
      for(const row of datos[model.name]){
        if(elegidos.get(model.name).has(row.id))continue;
        let links=relaciones(model).filter(r=>r.type!=='Usuario'&&r.relationFromFields.every(k=>row[k]!=null));
        if(!links.length)links=relaciones(model).filter(r=>r.type==='Usuario'&&r.relationFromFields.every(k=>row[k]!=null));
        if(links.length&&links.every(r=>{const p=parent(r,row);return p&&elegidos.get(r.type)?.has(p.id);})){elegidos.get(model.name).set(row.id,{...row});cambios++;}
      }
    }
    if(!cambios)break;
  }
  let perfilesControl=0;
  for(const model of modelos)for(const row of elegidos.get(model.name).values())for(const relation of relaciones(model)){
    if(relation.relationFromFields.some(k=>row[k]==null))continue;
    const p=parent(relation,row);
    if(!p)throw Error(`Referencia ausente en ${model.name}`);
    if(elegidos.get(relation.type)?.has(p.id))continue;
    if(relation.type==='Usuario'&&p.empresaId==null&&p.rol==='SUPERADMIN'){
      elegidos.get('Usuario').set(p.id,{...p,email:`control-${p.id}@invalid.powerpos`,password:'!control-profile-no-login!',activo:false,permisos:'{}',sucursalId:null,distribuidorId:null});perfilesControl++;
    } else throw Error(`La selección de ${model.name} requiere un registro fuera de la sede`);
  }
  // A child referencing both this tenant and an excluded business parent is ambiguous, never silently omitted.
  for(const model of modelos)for(const row of datos[model.name]){
    if(elegidos.get(model.name).has(row.id)||model.fields.some(f=>['empresaId','sucursalId'].includes(f.name)))continue;
    const links=relaciones(model).filter(r=>r.type!=='Usuario'&&r.relationFromFields.every(k=>row[k]!=null));
    if(links.some(r=>{const p=parent(r,row);return p&&elegidos.get(r.type)?.has(p.id);}))throw Error(`Hay un vínculo de alcance ambiguo en ${model.name}`);
  }
  return {datos:Object.fromEntries([...elegidos].map(([name,rows])=>[name,[...rows.values()].sort((a,b)=>a.id-b.id)])),perfilesControl};
}
function huella(rows) { return createHash('sha256').update(JSON.stringify(rows)).digest('hex'); }
function resumir(datos) { return Object.fromEntries(modelos.map(m=>[m.name,{cantidad:datos[m.name].length,huella:huella(datos[m.name])}])); }
async function cargarYVerificar(db,seleccion,empresaId,sucursalId) {
  // Only a newly provisioned, empty destination may be loaded. Never truncate or replace an existing tenant.
  for(const model of modelos)if(await db.$queryRawUnsafe(`SELECT 1 FROM ${q(model.dbName||model.name)} LIMIT 1`).then(r=>r.length))throw Error('El destino no está vacío; se conserva sin modificaciones');
  if(await db.selloBaseSede.count())throw Error('El destino ya tiene sello de sede');
  await db.$transaction(async tx=>{
    const constraints=await tx.$queryRawUnsafe("SELECT t.relname AS tabla,c.conname AS nombre FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND n.nspname='public'");
    for(const c of constraints)await tx.$executeRawUnsafe(`ALTER TABLE ${q(c.tabla)} ALTER CONSTRAINT ${q(c.nombre)} DEFERRABLE INITIALLY DEFERRED`);
    for(const model of modelos){
      const fields=campos(model);
      const types={String:'text',Int:'integer',Boolean:'boolean',Decimal:'numeric',DateTime:'timestamp',Json:'jsonb',BigInt:'bigint',Float:'double precision'};
      const source=seleccion.datos[model.name];
      for(let offset=0;offset<source.length;offset+=100){
        const values=[];
        const tuples=source.slice(offset,offset+100).map(row=>{
          const expressions=fields.map(f=>{
            values.push(f.isList?JSON.stringify(row[f.name]):row[f.name]);const position=values.length;
            return f.isList?`CASE WHEN $${position}::jsonb = 'null'::jsonb THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text($${position}::jsonb)) END`:`$${position}::${f.kind==='enum'?q(f.type):types[f.type]}`;
          });
          return `(${expressions.join(',')})`;
        });
        await tx.$executeRawUnsafe(`INSERT INTO ${q(model.dbName||model.name)} (${fields.map(f=>q(f.dbName||f.name)).join(',')}) VALUES ${tuples.join(',')}`,...values);
      }
    }
    await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    for(const c of constraints)await tx.$executeRawUnsafe(`ALTER TABLE ${q(c.tabla)} ALTER CONSTRAINT ${q(c.nombre)} NOT DEFERRABLE`);
    for(const model of modelos){
      if(model.fields.find(f=>f.name==='id')?.default?.name!=='autoincrement')continue;
      const table=q(model.dbName||model.name);
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT MAX(id) FROM ${table}),1),EXISTS(SELECT 1 FROM ${table}))`,model.dbName||model.name);
    }
    const esperado=resumir(seleccion.datos),real={};
    for(const model of modelos)real[model.name]=await leerModelo(tx,model);
    if(JSON.stringify(esperado)!==JSON.stringify(resumir(real)))throw Error('La verificación de datos no coincide; se revierte toda la carga');
    await tx.selloBaseSede.create({data:{id:1,empresaId,sucursalId}});
  },{timeout:180000});
  return {tablas:modelos.length,huellas:resumir(seleccion.datos),perfilesControlSinCredenciales:seleccion.perfilesControl};
}
module.exports={snapshot,seleccionar,cargarYVerificar,resumir,modelos,q,leerModelo};
