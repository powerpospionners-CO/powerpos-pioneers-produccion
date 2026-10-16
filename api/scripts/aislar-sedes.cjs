const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const {PrismaClient}=require('@prisma/client');
const {conexionMigraciones}=require('./prisma-migrate.cjs');
const {snapshot,seleccionar,resumir}=require('./lib/sede-copy.cjs');
const {prepararBase}=require('./lib/sede-provision.cjs');
const db=new PrismaClient({datasources:{db:{url:conexionMigraciones(process.env)}}});
const test=process.argv.includes('--test');
async function main(){
  const source=new URL(conexionMigraciones(process.env));
  if(test&&source.hostname!=='ep-wispy-field-b5hmrrxb.c-7.us-east-2.aws.neon.tech')throw Error('La prueba solo puede ejecutarse en la copia de Neon');
  if(!test&&!process.argv.includes('--production'))throw Error('Indica el entorno explícitamente');
  if(!/^[a-fA-F0-9]{64}$/.test(process.env.SEDE_DATABASE_ENCRYPTION_KEY||''))throw Error('Falta la clave de cifrado');
  const state=await db.controlAislamiento.findUnique({where:{id:1}});
  if(!state?.escriturasSuspendidas||await db.escrituraEnCurso.count())throw Error('Primero suspende las escrituras y espera a que terminen las operaciones en curso');
  if(state.activo)throw Error('El aislamiento ya está activo; no se copiará otra vez el origen');
  const before=await snapshot(db),fingerprint=resumir(before);
  const sedes=before.Sucursal;
  const results=[];
  for(const sede of sedes){
    const seleccion=seleccionar(before,sede.empresaId,sede.id);
    results.push(await prepararBase(db,sede.empresaId,sede.id,seleccion));
    console.log(JSON.stringify(results.at(-1)));
  }
  if(JSON.stringify(fingerprint)!==JSON.stringify(resumir(await snapshot(db))))throw Error('El origen cambió durante la copia; las bases no se activarán');
  console.log(JSON.stringify({basesVerificadas:results.length,origenSinCambios:true,aislamientoActivado:false}));
}
main().catch(()=>{console.error('La preparación falló. Se conservaron el origen y los destinos; no se activaron conexiones.');process.exitCode=1;}).finally(()=>db.$disconnect());
