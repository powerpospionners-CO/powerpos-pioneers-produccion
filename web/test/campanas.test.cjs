const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('las campañas viven en Mi tienda cuando hay boletín y piden confirmación antes de enviar',()=>{
 assert.match(fs.readFileSync('app/mi-tienda/page.tsx','utf8'),/config\.tienda\.boletinHabilitado && <CampanasCorreo \/>/);
 const c=fs.readFileSync('app/mi-tienda/CampanasCorreo.tsx','utf8');
 assert.match(c,/await confirmar\(/);
 assert.match(c,/\/tienda-admin\/campanas\/vista-previa/);
});
test('el enlace de baja del correo abre el boletín en modo baja con el correo escrito',()=>{
 const b=fs.readFileSync('components/tienda/BoletinTienda.tsx','utf8');
 assert.match(b,/get\("baja"\)/);
 assert.match(b,/id="boletin"/);
});
