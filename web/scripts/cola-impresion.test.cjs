const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const contexto=vm.createContext({exports:{}});vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/colaImpresion.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,contexto);
test('encola de inmediato y conserva el orden sin esperar a la impresora para devolver el control',async()=>{
  const cola=contexto.exports.crearColaImpresion(),orden=[];let liberar;
  const espera=new Promise(r=>liberar=r);
  const primera=cola.encolar(async()=>{orden.push('inicio1');await espera;orden.push('fin1');});
  const segunda=cola.encolar(async()=>{orden.push('inicio2');});
  orden.push('caja libre');await Promise.resolve();assert.deepEqual(orden,['caja libre','inicio1']);
  liberar();await Promise.all([primera,segunda]);assert.deepEqual(orden,['caja libre','inicio1','fin1','inicio2']);
});
test('un fallo de impresión no descarta los trabajos posteriores',async()=>{
  const cola=contexto.exports.crearColaImpresion();const fallo=cola.encolar(async()=>{throw Error('sin red')});const siguiente=cola.encolar(async()=>42);
  await assert.rejects(fallo,/sin red/);assert.equal(await siguiente,42);
});
