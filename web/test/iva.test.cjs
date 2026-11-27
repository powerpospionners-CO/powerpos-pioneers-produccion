const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('Contabilidad tiene pestañas de IVA y los recibos del navegador muestran base e IVA',()=>{
 const p=fs.readFileSync('app/contabilidad/page.tsx','utf8');
 assert.match(p,/<TarifasIva \/>/);assert.match(p,/<ReporteIva \/>/);
 assert.match(fs.readFileSync('app/pos/RetailPOS.tsx','utf8'),/pedido\.desgloseIva/);
 assert.match(fs.readFileSync('app/pos/page.tsx','utf8'),/pedido\.desgloseIva/);
});
test('solo el administrador edita las tarifas',()=>{
 const t=fs.readFileSync('components/contabilidad/TarifasIva.tsx','utf8');
 assert.match(t,/=== 'ADMIN_EMPRESA'/);
 assert.match(t,/disabled=\{!admin/);
});
