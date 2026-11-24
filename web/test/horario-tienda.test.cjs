const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');const path=require('node:path');
const file=path.resolve('lib/horarioTienda.ts');const m=new Module(file,module);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {estadoHorario,horarioValido}=m.exports;
const semana=()=>Array.from({length:7},(_,dia)=>({dia,abierto:dia<6,apertura:'10:30',cierre:'19:30'}));
test('usa Colombia aunque el visitante esté en otra zona y cierra en el minuto exacto',()=>{
 assert.equal(estadoHorario(semana(),new Date('2026-11-24T15:29:00Z')).abierto,false);
 assert.equal(estadoHorario(semana(),new Date('2026-11-24T15:30:00Z')).abierto,true);
 assert.equal(estadoHorario(semana(),new Date('2026-11-25T00:30:00Z')).abierto,false);
 assert.equal(estadoHorario(semana(),new Date('2026-11-25T00:30:00Z')).dia,1);
});
test('considera el cierre nocturno del día anterior incluso el lunes',()=>{
 const h=semana().map(v=>({...v,abierto:v.dia===6,apertura:'18:00',cierre:'02:00'}));
 assert.equal(estadoHorario(h,new Date('2026-11-23T06:59:00Z')).abierto,true);
 assert.equal(estadoHorario(h,new Date('2026-11-23T07:00:00Z')).abierto,false);
 assert.match(estadoHorario(h,new Date('2026-11-23T06:00:00Z')).detalle,/Cierra hoy/);
});
test('identifica próxima apertura y una semana completamente cerrada',()=>{
 assert.match(estadoHorario(semana(),new Date('2026-11-22T17:00:00Z')).detalle,/mañana/);
 assert.match(estadoHorario(semana().map(v=>({...v,abierto:false})),new Date('2026-11-24T18:00:00Z')).detalle,/Sin días/);
});
test('no calcula estados a partir de horarios incompletos o ambiguos',()=>{
 assert(horarioValido(semana()));assert(!horarioValido(null));assert(!horarioValido([]));assert(!horarioValido(semana().map(v=>({...v,dia:0}))));assert(!horarioValido(semana().map(v=>({...v,apertura:'25:00'}))));
});
