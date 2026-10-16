const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {PrismaClient}=require('@prisma/client');
const {conexionMigraciones}=require('./prisma-migrate.cjs');
const {snapshot,seleccionar,resumir}=require('./lib/sede-copy.cjs');
const {descifrarConexion}=require('../dist/src/prisma/conexion-cifrada');
const url=conexionMigraciones(process.env);
const db=new PrismaClient({datasources:{db:{url}}});
async function main(){
  const comando=process.argv[2];
  if(!['suspender','reanudar','activar'].includes(comando))throw Error('Comando inválido');
  const test=process.argv.includes('--test');
  if(test && new URL(url).hostname!=='ep-wispy-field-b5hmrrxb.c-7.us-east-2.aws.neon.tech')throw Error('Entorno de prueba incorrecto');
  if(!test&&!process.argv.includes('--production'))throw Error('Falta indicar el entorno');
  if(comando!=='activar'){
    await db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73200,0)`;
      const estado=await tx.controlAislamiento.findUnique({where:{id:1}});
      if(comando==='reanudar'&&estado?.activo)throw Error('El aislamiento activo no se puede revertir sin reconciliar nuevas operaciones');
      await tx.controlAislamiento.upsert({where:{id:1},create:{id:1,escriturasSuspendidas:comando==='suspender'},update:{escriturasSuspendidas:comando==='suspender'}});
    });
    console.log(JSON.stringify({escriturasSuspendidas:comando==='suspender',operacionesEnCurso:await db.escrituraEnCurso.count()}));return;
  }
  const estado=await db.controlAislamiento.findUnique({where:{id:1}});
  if(!estado?.escriturasSuspendidas||estado.activo||await db.escrituraEnCurso.count())throw Error('La activación exige origen suspendido y sin operaciones pendientes');
  const before=await snapshot(db), huellas=resumir(before);
  const registros=await db.baseSede.findMany({orderBy:{sucursalId:'asc'}});
  if(registros.length!==before.Sucursal.length)throw Error('La cobertura de sedes no coincide');
  for(const sede of before.Sucursal){
    const registro=registros.find(r=>r.empresaId===sede.empresaId&&r.sucursalId===sede.id&&r.estado==='VERIFICADA'&&r.verificadoEn);
    if(!registro)throw Error('Una sede no está verificada');
    const conexion=descifrarConexion(registro.conexionCifrada,sede.empresaId,sede.id);
    const destino=new PrismaClient({datasources:{db:{url:conexion}}});
    try{
      const sello=await destino.selloBaseSede.findUnique({where:{id:1}});
      if(sello?.empresaId!==sede.empresaId||sello?.sucursalId!==sede.id)throw Error('Sello de sede inválido');
      if(JSON.stringify(resumir((seleccionar(before,sede.empresaId,sede.id)).datos))!==JSON.stringify(resumir(await snapshot(destino))))throw Error('Los datos de una sede no coinciden');
      const roles=await destino.$queryRawUnsafe('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user');
      if(roles.length!==1||roles[0].rolsuper||roles[0].rolcreatedb||roles[0].rolcreaterole)throw Error('El usuario operativo tiene privilegios excesivos');
      // Actual login attempts to every other physical database must fail.
      for(const otra of registros.filter(r=>r.id!==registro.id)){
        const foreign=new URL(conexion);foreign.pathname=new URL(descifrarConexion(otra.conexionCifrada,otra.empresaId,otra.sucursalId)).pathname;
        const probe=new PrismaClient({datasources:{db:{url:foreign.toString()}}});let permitido=false;
        try{await probe.$connect();permitido=true;}catch{}finally{await probe.$disconnect();}
        if(permitido)throw Error('Una sede puede conectarse a la base de otra');
      }
      const controlURL=new URL(conexion);controlURL.pathname=new URL(url).pathname;
      const probe=new PrismaClient({datasources:{db:{url:controlURL.toString()}}});let puedeLeer=false;
      try{await probe.$queryRawUnsafe('SELECT id FROM empresas LIMIT 1');puedeLeer=true;}catch{}finally{await probe.$disconnect();}
      if(puedeLeer)throw Error('Una sede puede leer datos del origen compartido');
    }finally{await destino.$disconnect();}
    console.log(JSON.stringify({empresaId:sede.empresaId,sucursalId:sede.id,datosVerificados:true,accesoOtrasBases:false}));
  }
  if(JSON.stringify(huellas)!==JSON.stringify(resumir(await snapshot(db))))throw Error('El origen cambió durante la verificación');
  await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(73200,0)`;
    const actual=await tx.controlAislamiento.findUnique({where:{id:1}});
    if(!actual?.escriturasSuspendidas||actual.activo||await tx.escrituraEnCurso.count())throw Error('El estado del origen cambió');
    if(await tx.sucursal.count()!==registros.length)throw Error('Cambió la cobertura de sedes');
    for(const r of registros)await tx.baseSede.update({where:{id:r.id},data:{estado:'ACTIVA'}});
    await tx.controlAislamiento.update({where:{id:1},data:{activo:true,escriturasSuspendidas:false}});
  });
  console.log(JSON.stringify({aislamientoActivado:true,bases:registros.length,origenConservado:true}));
}
main().catch(()=>{console.error('No se completó la operación de aislamiento. No se eliminó ni sobrescribió información.');process.exitCode=1;}).finally(()=>db.$disconnect());
