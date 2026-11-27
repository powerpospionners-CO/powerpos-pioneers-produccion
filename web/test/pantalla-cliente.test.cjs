const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ts=require('typescript');
const m={exports:{}};new Function('exports','module',ts.transpile(fs.readFileSync('lib/pantallaCliente.ts','utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}))(m.exports,m);
test('la pantalla del cliente solo muestra QR de una tienda publicada',()=>{
 assert.equal(m.exports.qrTiendaCliente({tiendaSlug:'trailer',tiendaConfig:{publicada:true}},'powerpospioneers.com'),'https://app.powerpospioneers.com/tienda/trailer');
 assert.equal(m.exports.qrTiendaCliente({tiendaSlug:'trailer',tiendaConfig:{publicada:false}},'powerpospioneers.com'),null);
 assert.equal(m.exports.qrTiendaCliente({tiendaConfig:{publicada:true}},'powerpospioneers.com'),null);
 assert.match(fs.readFileSync('app/cliente/page.tsx','utf8'),/qrTiendaCliente\(data/);
});
