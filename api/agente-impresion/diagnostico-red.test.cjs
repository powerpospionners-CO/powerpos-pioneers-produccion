const {test}=require('node:test'),assert=require('node:assert/strict'),net=require('node:net');
const {probarPuerto}=require('./diagnostico-red');
test('la prueba solo conecta: no envia bytes de impresion',async()=>{
 let recibidos=0;const servidor=net.createServer(socket=>socket.on('data',datos=>{recibidos+=datos.length;}));
 await new Promise(r=>servidor.listen(0,'127.0.0.1',r));
 try{const r=await probarPuerto('127.0.0.1',servidor.address().port);assert.equal(r.abierto,true);assert.equal(recibidos,0);}finally{await new Promise(r=>servidor.close(r));}
});
test('informa un puerto cerrado como fallo de red sin imprimir',async()=>{
 const servidor=net.createServer();await new Promise(r=>servidor.listen(0,'127.0.0.1',r));const puerto=servidor.address().port;await new Promise(r=>servidor.close(r));
 const r=await probarPuerto('127.0.0.1',puerto,500);assert.equal(r.abierto,false);assert.equal(r.motivo,'ECONNREFUSED');
});
