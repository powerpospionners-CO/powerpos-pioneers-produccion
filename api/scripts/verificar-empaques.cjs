// Solo lecturas autenticadas; no crea existencias, empaques ni ventas.
require('dotenv').config({quiet:true});
const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
const {descifrarConexion}=require('../dist/src/prisma/conexion-cifrada');
const control=new PrismaClient();
(async()=>{
 for(const sede of await control.baseSede.findMany({where:{estado:'ACTIVA'}})){
  const db=new PrismaClient({datasources:{db:{url:descifrarConexion(sede.conexionCifrada,sede.empresaId,sede.sucursalId)}}});
  try{
   const admin=await db.usuario.findFirst({where:{empresaId:sede.empresaId,rol:'ADMIN_EMPRESA',activo:true}});
   if(!admin||!process.env.JWT_SECRET)throw Error('No se puede comprobar la sesión');
   const token=jwt.sign({sub:admin.id,email:admin.email,rol:admin.rol,empresaId:sede.empresaId,sucursalId:sede.sucursalId},process.env.JWT_SECRET,{expiresIn:'2m'});
   const response=await fetch('https://api.powerpospioneers.com/inventario/empaques',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
   const data=await response.json();
   if(response.status!==200||!Array.isArray(data.materias)||!Array.isArray(data.historial))throw Error('La lectura de bodega falló');
   if(data.materias.some(m=>m.empresaId!==sede.empresaId))throw Error('Ámbito incorrecto');
   console.log(JSON.stringify({empresaId:sede.empresaId,sucursalId:sede.sucursalId,bodega:response.status,materias:data.materias.length,registros:data.historial.length}));
   const cajero=await db.usuario.findFirst({where:{empresaId:sede.empresaId,rol:'CAJERO',activo:true}});
   if(cajero){const t=jwt.sign({sub:cajero.id,email:cajero.email,rol:cajero.rol,empresaId:sede.empresaId,sucursalId:sede.sucursalId},process.env.JWT_SECRET,{expiresIn:'2m'});const r=await fetch('https://api.powerpospioneers.com/inventario/empaques',{headers:{Authorization:`Bearer ${t}`},signal:AbortSignal.timeout(30000)});if(r.status!==403)throw Error('Los permisos de bodega no son correctos');console.log(JSON.stringify({empresaId:sede.empresaId,cajeroSinAccesoAdministrativo:r.status}));}
  }finally{await db.$disconnect();}
 }
})().catch(()=>{console.error('No se completó la verificación de bodega');process.exitCode=1;}).finally(()=>control.$disconnect());
