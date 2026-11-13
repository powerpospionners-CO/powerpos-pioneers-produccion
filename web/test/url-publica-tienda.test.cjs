const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const compilar=p=>ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function cargar(fetch){const seo={};new Function('exports','process',compilar('lib/seoTienda.ts'))(seo,{env:{}});const exports={};new Function('exports','require','fetch',compilar('lib/urlPublicaTienda.ts'))(exports,n=>n==='server-only'?{}:seo,fetch);return exports.urlPublicaTienda;}
test('conserva el subdominio conectado y comparte su comprobación',async()=>{
 const peticiones=[];const resolver=cargar(async url=>{peticiones.push(url);return {ok:true,json:async()=>({version:'build-prueba'})};});
 const urls=await Promise.all([resolver('mercado'),resolver('mercado')]);
 assert.deepEqual(urls,['https://mercado.powerpospioneers.com/','https://mercado.powerpospioneers.com/']);assert.deepEqual(peticiones,['https://mercado.powerpospioneers.com/api/version']);
});
test('un dominio no conectado usa la página pública funcional, sin aceptar hosts arbitrarios',async()=>{
 const resolver=cargar(async()=>({ok:false,status:402}));
 assert.equal(await resolver('cajica'),'https://app.powerpospioneers.com/tienda/cajica');
 assert.throws(()=>resolver('../privado'));
});
