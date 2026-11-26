const {test, after}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const archivo=path.resolve('lib/cargarCatalogo.ts');
const mod=new Module(archivo,module);
mod._compile(ts.transpileModule(fs.readFileSync(archivo,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,archivo);
const {cargarCatalogo}=mod.exports;
const original=global.fetch;
after(()=>global.fetch=original);
test('recupera el catálogo tras un timeout sin caché ni mutaciones',async()=>{
 let llamadas=[];
 global.fetch=async(url,opciones)=>{llamadas.push([url,opciones]);if(llamadas.length===1)throw new DOMException('timeout','TimeoutError');return new Response('{}');};
 assert.equal((await cargarCatalogo('https://ejemplo.co/tiendas/uno')).status,200);
 assert.equal(llamadas.length,2);
 for(const [url,o] of llamadas){assert.equal(url,'https://ejemplo.co/tiendas/uno');assert.equal(o.cache,'no-store');assert.equal(o.method,undefined);assert.ok(o.signal);}
});
test('reintenta errores temporales del servidor pero conserva 404 y 400',async()=>{
 for(const status of [502,503,504,404,400]){let llamadas=0;global.fetch=async()=>{llamadas++;return new Response('{}',{status:llamadas===1?status:200});};const r=await cargarCatalogo('https://ejemplo.co');assert.equal(llamadas,status>=500?2:1);assert.equal(r.status,status>=500?200:status);}
});
test('un fallo persistente termina tras dos intentos',async()=>{
 let llamadas=0;global.fetch=async()=>{llamadas++;throw new TypeError('fetch failed');};
 await assert.rejects(cargarCatalogo('https://ejemplo.co'),/fetch failed/);assert.equal(llamadas,2);
});
