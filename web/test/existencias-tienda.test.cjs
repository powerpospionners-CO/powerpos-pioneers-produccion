const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const m={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('lib/existenciasTienda.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports);
const {existenciasTienda,puedePedirProducto}=m.exports;
test('muestra cero para agotados y bloquea cantidades superiores al stock al refrescar el catálogo',()=>{
 for(const stock of [0,-10,undefined,NaN]){assert.equal(existenciasTienda(stock),0);assert.equal(puedePedirProducto(stock,1,true),false);}
 assert.equal(existenciasTienda(250),250);
 assert.equal(puedePedirProducto(250,250,true),true);
 assert.equal(puedePedirProducto(249,250,true),false);
 assert.equal(puedePedirProducto(250,1,false),false);
 assert.equal(puedePedirProducto(250,0,true),false);
});
