const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('el formulario de productos muestra y guarda la tarifa de IVA solo para el administrador',()=>{
 const p=fs.readFileSync('app/productos/page.tsx','utf8');
 assert.match(p,/<SelectorIvaProducto config=\{ivaConfig\}/);
 assert.match(p,/editable=\{rolUsuario === 'ADMIN_EMPRESA'\}/);
 assert.match(p,/guardadoId && rolUsuario === 'ADMIN_EMPRESA'/);
 const c=fs.readFileSync('components/contabilidad/IvaProducto.tsx','utf8');
 assert.match(c,/if \(actual\?\.confirmada && actual\.tarifa === tarifa\) return;/);
 assert.match(c,/if \(!config\.responsable\) return null;/);
});
