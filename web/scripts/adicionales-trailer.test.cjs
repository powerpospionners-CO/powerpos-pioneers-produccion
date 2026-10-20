const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const contexto=vm.createContext({exports:{}});vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/adicionalesTrailer.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,contexto);
const {adicionalesParaTrailer}=contexto.exports;
const queso={id:1,nombre:'Queso',disponible:true,ingredienteId:10,cantidad:30,ingrediente:{activo:true}};
const empaque={id:4,nombre:'Porta',empaqueParaLlevar:true,disponible:true};
test('ofrece el catálogo global de comida sin asignación y conserva solo el empaque asociado',()=>{
 const producto={nombre:'Perro',aceptaAdicionales:false,adicionales:[{adicional:empaque}]};
 const lista=adicionalesParaTrailer(producto,[queso,{id:2,disponible:false},{id:3,ingredienteId:11,cantidad:null},empaque]);
 assert.deepEqual(Array.from(lista,a=>a.id),[1,4]);
});
test('no ofrece extras de comida a bebidas, incluyendo subcategorías',()=>{
 for(const producto of [{nombre:'Coca Cola personal'},{nombre:'Personal 250 ml',categoria:{nombre:'Personales',parentId:1}},{nombre:'Café'},{nombre:'Jugo natural'}])
  assert.equal(adicionalesParaTrailer(producto,[queso],[{id:1,nombre:'Bebidas'}]).length,0);
});
