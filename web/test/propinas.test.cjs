const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modal=fs.readFileSync('components/ModalCobro.tsx','utf8');
test('la propina se pregunta al cliente y no se cobra sin una respuesta',()=>{
 assert.match(modal,/Pregúntale al cliente si desea incluir la propina voluntaria/);
 assert.match(modal,/if \(!propinaValida\) return false;/);
 assert.match(modal,/eleccionPropina !== ''/);
});
test('la propina en efectivo se suma a lo recibido y no altera el cambio',()=>{
 assert.match(modal,/recibidoUnico >= total \+ propinaEfectivo/);
 assert.match(modal,/recibidoUnico - total - propinaEfectivo/);
 assert.match(modal,/objetivo=\{total \+ propinaEfectivo\}/);
});
test('la venta envía la propina y el cierre pide a quién repartirla',()=>{
 assert.match(fs.readFileSync('app/pos/page.tsx','utf8'),/propina: pago\.propina/);
 const caja=fs.readFileSync('components/CajaControl.tsx','utf8');
 assert.match(caja,/propinaParticipantes: reparto/);
 assert.match(caja,/hayPropinas && !reparto\.length/);
});
