const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),Module=require('node:module'),path=require('node:path');
const cargar=f=>{const file=path.resolve(f),m=new Module(file,module);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);return m.exports;};
const {claveLinea,precioLinea,etiquetaOpciones,normalizarOpciones,tieneOpciones}=cargar('lib/opcionesTienda.ts');
const producto={id:10,precio:'15000',presentaciones:[{id:3,nombre:'Doble',precio:22000}],adicionales:[{id:1,nombre:'Queso',precio:2000},{id:2,nombre:'Tocineta',precio:3000}]};
test('el precio de la línea suma presentación y adicionales con el catálogo vigente',()=>{
 assert.equal(precioLinea(producto,{adicionales:[]}),15000);
 assert.equal(precioLinea(producto,{presentacionId:3,adicionales:[{adicionalId:1,cantidad:2}]}),26000);
 assert.equal(precioLinea(producto,{presentacionId:9,adicionales:[]}),null);
 assert.equal(precioLinea(producto,{adicionales:[{adicionalId:7,cantidad:1}]}),null);
 assert.equal(etiquetaOpciones(producto,{presentacionId:3,adicionales:[{adicionalId:1,cantidad:2}],observacion:'sin cebolla'}),'Doble · + Queso ×2 · Nota: sin cebolla');
 assert(tieneOpciones(producto)); assert(!tieneOpciones({id:1,precio:'1'}));
});
test('las mismas opciones en otro orden son la misma línea; opciones distintas, otra línea',()=>{
 const a=claveLinea(10,{adicionales:[{adicionalId:2,cantidad:1},{adicionalId:1,cantidad:1}]});
 const b=claveLinea(10,{adicionales:[{adicionalId:1,cantidad:1},{adicionalId:2,cantidad:1}],observacion:'  '});
 assert.equal(a,b); assert.notEqual(a,claveLinea(10,{adicionales:[]}));
 assert.deepEqual(normalizarOpciones({adicionales:[{adicionalId:1,cantidad:0}],observacion:' x '}),{adicionales:[],observacion:'x'});
});
