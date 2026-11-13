const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const m={exports:{}};
new Function('exports','process',ts.transpileModule(fs.readFileSync('lib/seoTienda.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m.exports,{env:{}});
const {slugDelHost,urlTienda,jsonSeguro}=m.exports;
test('usa una dirección canónica por empresa sin aceptar hosts ajenos ni reservados',()=>{
 assert.equal(urlTienda('enchilamarketpereira'),'https://enchilamarketpereira.powerpospioneers.com/');
 assert.equal(slugDelHost('enchilamarketpereira.powerpospioneers.com'),'enchilamarketpereira');
 for(const h of ['app.powerpospioneers.com','api.powerpospioneers.com','otra.com','evil.powerpospioneers.com.atacante.com','a.b.powerpospioneers.com'])assert.equal(slugDelHost(h),null,h);
 assert.throws(()=>urlTienda('../admin'));
});
test('los datos del negocio no pueden cerrar el script de información estructurada',()=>{
 const texto=jsonSeguro({name:'</script><script>alert(1)</script>'});
 assert.ok(!texto.includes('<'));assert.equal(JSON.parse(texto).name,'</script><script>alert(1)</script>');
});
