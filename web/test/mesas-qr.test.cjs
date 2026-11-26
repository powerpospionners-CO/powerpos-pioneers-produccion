const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
// La función es pura; se evalúa sin cargar el componente cliente completo.
const fuente=fs.readFileSync('app/mi-tienda/ExperienciaTienda.tsx','utf8');
const cuerpo=fuente.slice(fuente.indexOf('export function urlMesa'),fuente.indexOf('const escapar'));
const urlMesa=new Function(`${require('typescript').transpile(cuerpo.replace('export ',''))}; return urlMesa;`)();
test('el QR de mesa apunta a la tienda según el dominio desde donde se imprime',()=>{
 assert.equal(urlMesa('https://app.powerpospioneers.com','app.powerpospioneers.com','trailer',3,'abc'),'https://app.powerpospioneers.com/tienda/trailer/productos?mesa=3&t=abc');
 assert.equal(urlMesa('https://trailer.powerpospioneers.com','trailer.powerpospioneers.com','trailer',3,'abc'),'https://trailer.powerpospioneers.com/tienda/productos?mesa=3&t=abc');
});
