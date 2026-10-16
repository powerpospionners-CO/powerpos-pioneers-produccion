require('dotenv').config({quiet:true});
const {PrismaClient}=require('@prisma/client');
const jwt=require('jsonwebtoken');
const {descifrarConexion}=require('../dist/src/prisma/conexion-cifrada');
const control=new PrismaClient();
async function main(){
  const state=await control.controlAislamiento.findUnique({where:{id:1}});
  if(!state?.activo||state.escriturasSuspendidas)throw Error('Aislamiento no activo');
  const sedes=await control.baseSede.findMany({where:{estado:'ACTIVA'}});
  const origen=(process.env.APP_URL||'https://api.powerpospioneers.com').replace(/\/$/,'');
  for(const sede of sedes){
    const db=new PrismaClient({datasources:{db:{url:descifrarConexion(sede.conexionCifrada,sede.empresaId,sede.sucursalId)}}});
    try{
      const sello=await db.selloBaseSede.findUnique({where:{id:1}});
      if(sello?.empresaId!==sede.empresaId||sello?.sucursalId!==sede.sucursalId||await db.empresa.count()!==1||await db.sucursal.count()!==1)throw Error('Destino inválido');
      const admin=await db.usuario.findFirst({where:{empresaId:sede.empresaId,rol:'ADMIN_EMPRESA',activo:true},select:{id:true,email:true,rol:true}});
      if(!admin||!process.env.JWT_SECRET)throw Error('No se puede verificar la sesión');
      const token=jwt.sign({sub:admin.id,email:admin.email,rol:admin.rol,empresaId:sede.empresaId,sucursalId:sede.sucursalId},process.env.JWT_SECRET,{expiresIn:'2m'});
      const resultados=[];
      for(const ruta of ['/empresa','/preparaciones']){
        const resp=await fetch(origen+ruta,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
        const data=await resp.json();
        if(!resp.ok||(ruta==='/empresa'&&data.id!==sede.empresaId))throw Error('La consulta autenticada falló');
        resultados.push({ruta,status:resp.status});
      }
      console.log(JSON.stringify({empresaId:sede.empresaId,sucursalId:sede.sucursalId,baseIndependiente:true,consultas:resultados}));
    }finally{await db.$disconnect();}
  }
  console.log(JSON.stringify({aislamientoActivo:true,sedes:sedes.length,escriturasSuspendidas:false,operacionesEnCurso:await control.escrituraEnCurso.count()}));
}
main().catch(()=>{console.error('No se pudo confirmar el funcionamiento completo de las sedes.');process.exitCode=1;}).finally(()=>control.$disconnect());
