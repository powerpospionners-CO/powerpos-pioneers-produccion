const path=require('node:path');
const {randomBytes,createHash}=require('node:crypto');
const {spawn}=require('node:child_process');
const {PrismaClient}=require('@prisma/client');
const {cifrarConexion,descifrarConexion}=require('../../dist/src/prisma/conexion-cifrada');
const {identidadBase}=require('../../dist/src/prisma/sede-databases');
const {conexionMigraciones}=require('../prisma-migrate.cjs');
const {q,cargarYVerificar,snapshot,resumir}=require('./sede-copy.cjs');
const root=path.resolve(__dirname,'../..');
async function prepararBase(control,empresaId,sucursalId,seleccion,opciones={}) {
  if(!Number.isSafeInteger(empresaId)||!Number.isSafeInteger(sucursalId)||empresaId<1||sucursalId<1)throw Error('Sede inválida');
  const baseURL=new URL(conexionMigraciones(process.env));
  const dbName=`powerpos_e${empresaId}_s${sucursalId}_v1`,role=`powerpos_e${empresaId}_s${sucursalId}_operador`;
  let registro=await control.baseSede.findUnique({where:{empresaId_sucursalId:{empresaId,sucursalId}}});
  let conexion;
  if(registro) {
    conexion=new URL(descifrarConexion(registro.conexionCifrada,empresaId,sucursalId));
    if(conexion.pathname!==`/${dbName}`||conexion.username!==role||conexion.hostname!==baseURL.hostname||registro.identidadBase!==identidadBase(conexion.toString()))throw Error('El destino registrado no coincide con la sede');
  } else {
    const existe=await control.$queryRawUnsafe('SELECT 1 FROM pg_database WHERE datname=$1 UNION ALL SELECT 1 FROM pg_roles WHERE rolname=$2',dbName,role);
    if(existe.length)throw Error('El nombre de destino ya existe fuera del registro; se conserva sin cambios');
    conexion=new URL(baseURL);conexion.pathname=`/${dbName}`;conexion.username=role;conexion.password=randomBytes(32).toString('hex');
    const empresa=seleccion.datos.Empresa[0];
    registro=await control.baseSede.create({data:{empresaId,sucursalId,estado:'PREPARANDO',conexionCifrada:cifrarConexion(conexion.toString(),empresaId,sucursalId),identidadBase:identidadBase(conexion.toString()),slug:empresa.tiendaSlug,agenteHash:empresa.impresionAgenteToken?createHash('sha256').update(empresa.impresionAgenteToken).digest('hex'):null}});
  }
  const rolExiste=await control.$queryRawUnsafe('SELECT 1 FROM pg_roles WHERE rolname=$1',role);
  if(!rolExiste.length) {
    const secret=decodeURIComponent(conexion.password);
    if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Credencial no válida');
    await control.$executeRawUnsafe(`CREATE ROLE ${q(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 8 PASSWORD '${secret}'`);
  }
  await control.$executeRawUnsafe(`GRANT ${q(role)} TO CURRENT_USER`);
  const existeDB=await control.$queryRawUnsafe('SELECT 1 FROM pg_database WHERE datname=$1',dbName);
  if(!existeDB.length)await control.$executeRawUnsafe(`CREATE DATABASE ${q(dbName)} OWNER ${q(role)}`);
  await control.$executeRawUnsafe(`REVOKE CONNECT ON DATABASE ${q(dbName)} FROM PUBLIC`);
  await control.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${q(dbName)} TO ${q(role)}`);
  const db=new PrismaClient({datasources:{db:{url:conexion.toString()}}});
  try {
    if(['ACTIVA','VERIFICADA'].includes(registro.estado)) {
      const sello=await db.selloBaseSede.findUnique({where:{id:1}});
      if(!sello||sello.empresaId!==empresaId||sello.sucursalId!==sucursalId)throw Error('El destino activo no corresponde a la sede');
      if(registro.estado==='VERIFICADA' && JSON.stringify(resumir(await snapshot(db)))!==JSON.stringify(resumir(seleccion.datos)))throw Error('El destino verificado no coincide con el origen actual; no se sobreescribirá');
      if(opciones.activar&&registro.estado==='VERIFICADA')await control.baseSede.update({where:{id:registro.id},data:{estado:'ACTIVA'}});
      return {empresaId,sucursalId,estado:registro.estado};
    }
    await new Promise((resolve,reject)=>{
      const migration=spawn(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy'],{cwd:root,env:{...process.env,DATABASE_URL:conexion.toString(),DIRECT_DATABASE_URL:conexion.toString()},stdio:'ignore',windowsHide:true});
      const timer=setTimeout(()=>{migration.kill();reject(Error('No se pudo aplicar el esquema al destino'));},120000);
      migration.once('error',()=>{clearTimeout(timer);reject(Error('No se pudo iniciar la migración'));});
      migration.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('No se pudo aplicar el esquema al destino'));});
    });
    await db.$executeRawUnsafe('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    const comprobacion=await cargarYVerificar(db,seleccion,empresaId,sucursalId);
    await control.baseSede.update({where:{id:registro.id},data:{estado:opciones.activar?'ACTIVA':'VERIFICADA',verificacion:comprobacion,verificadoEn:new Date()}});
    return {empresaId,sucursalId,estado:opciones.activar?'ACTIVA':'VERIFICADA',tablas:comprobacion.tablas,registros:Object.values(comprobacion.huellas).reduce((s,t)=>s+t.cantidad,0)};
  } finally { await db.$disconnect(); }
}
module.exports={prepararBase};
