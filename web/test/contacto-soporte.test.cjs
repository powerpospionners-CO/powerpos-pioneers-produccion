const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('el contacto de soporte se edita en el superadmin y se muestra en la ayuda desde el API',()=>{
 assert.match(fs.readFileSync('app/superadmin/page.tsx','utf8'),/<ContactoSoporteConfig \/>/);
 const a=fs.readFileSync('app/ayuda/page.tsx','utf8');
 assert.match(a,/api\.get\('\/ayuda\/contacto'\)/);
 assert.doesNotMatch(a,/NEXT_PUBLIC_SOPORTE_WHATSAPP/);
});
