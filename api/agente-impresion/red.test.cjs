const {test}=require('node:test'),assert=require('node:assert/strict');
const {imprimirRed}=require('./agente');
test('reintenta en la misma IP cuando la impresora vuelve a responder',async()=>{
  let envios=0,guardados=0;
  const resultado=await imprimirRed({impresoraHost:'127.0.0.10',impresoraPuerto:9100},Buffer.from('comanda').toString('base64'),false,{
    enviar:async()=>++envios===1?'timeout':null,buscar:async()=> '127.0.0.10',guardar:()=>guardados++,
  });assert.equal(resultado,null);assert.equal(envios,2);assert.equal(guardados,0);
});
test('actualiza una IP nueva y reenvía exactamente los mismos bytes',async()=>{
  const datos=Buffer.from([27,64,27,112,0,25,250,65]),recibidos=[],config={impresoraHost:'127.0.0.10',impresoraPuerto:9100};let guardado;
  const r=await imprimirRed(config,datos.toString('base64'),false,{enviar:async(c,b)=>{recibidos.push(Buffer.from(b));return recibidos.length===1?'error':null;},buscar:async()=> '127.0.0.11',guardar:ip=>guardado=ip});
  assert.equal(r,null);assert.equal(config.impresoraHost,'127.0.0.11');assert.equal(guardado,'127.0.0.11');assert.deepEqual(recibidos,[datos,datos]);
});
test('limita el reintento y comunica que la impresora sigue sin responder',async()=>{
  let envios=0;const r=await imprimirRed({impresoraHost:'127.0.0.10',impresoraPuerto:9100},'',false,{enviar:async()=>{envios++;return 'timeout';},buscar:async()=> '127.0.0.10',guardar:()=>{}});
  assert.equal(envios,2);assert.match(r,/Tiempo agotado/);
});
test('no busca otra IP si el primer envío fue correcto',async()=>{
  let busquedas=0;assert.equal(await imprimirRed({impresoraHost:'127.0.0.10'},'',false,{enviar:async()=>null,buscar:async()=>{busquedas++;},guardar:()=>{}}),null);assert.equal(busquedas,0);
});
test('reintenta la IP guardada si el sondeo no detectó la impresora',async()=>{
  let envios=0;const r=await imprimirRed({impresoraHost:'127.0.0.10',impresoraPuerto:9100},'',false,{enviar:async()=>++envios===1?'timeout':null,buscar:async()=>null,guardar:()=>{throw Error('No guardar IP desconocida');}});
  assert.equal(r,null);assert.equal(envios,2);
});
