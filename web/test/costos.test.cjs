const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ts=require('typescript');
const cargar=(ruta,extra={})=>{const m={exports:{}};new Function('exports','module','require',ts.transpile(fs.readFileSync(ruta,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}))(m.exports,m,(n)=>extra[n]||require(n));return m.exports;};
const {csvSeguro}=cargar('lib/csvSeguro.ts');
const {filasCsv}=cargar('lib/csv.ts',{'./csvSeguro':{csvSeguro}});
test('el CSV usa punto y coma, decimales con coma y neutraliza fórmulas',()=>{
 const csv=filasCsv(['Nombre','Valor'],[['=HYPERLINK("x")',1234.5],['Pan',-3]]);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.equal(csv.slice(1).split('\r\n')[1],'"\'=HYPERLINK(""x"")";1234,5');
 assert.equal(csv.split('\r\n')[2],'"Pan";-3');
});
test('Costos queda solo para administrador y gerente con el permiso de inventario',()=>{
 const nav=fs.readFileSync('components/Navbar.tsx','utf8');
 assert.match(nav,/'\/costos': 'inventario'/);
 assert.match(nav,/item\.href === '\/costos' && !esAdminOGerente/);
});
