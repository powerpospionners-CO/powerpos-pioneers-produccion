const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ts=require('typescript');
const m={exports:{}};new Function('exports','module',ts.transpile(fs.readFileSync('lib/ayuda.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}))(m.exports,m);
const {guiasPara,GUIAS}=m.exports;
test('la ayuda muestra a cada rol solo sus guías y busca sin tildes',()=>{
 const cajero=guiasPara('CAJERO').map(g=>g.id);
 assert.ok(cajero.includes('abrir-caja')&&cajero.includes('seguridad'));
 assert.ok(!cajero.includes('contabilidad')&&!cajero.includes('mesero'));
 assert.ok(guiasPara('ADMIN_EMPRESA').length===GUIAS.length);
 assert.deepEqual(guiasPara('GERENTE','contador').map(g=>g.id).sort(),['contabilidad','iva']);
 assert.ok(guiasPara('ADMIN_EMPRESA','camara').length===0);
 assert.ok(guiasPara('ADMIN_EMPRESA','PROPINA').some(g=>g.id==='propinas'));
});
test('cada guía apunta a una pantalla que existe',()=>{
 for(const g of GUIAS) if(g.ruta) assert.ok(fs.existsSync(`app${g.ruta}/page.tsx`),`No existe ${g.ruta}`);
});
