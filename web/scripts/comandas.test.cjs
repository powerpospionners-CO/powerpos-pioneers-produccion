const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), ts=require('typescript');
const fuente=fs.readFileSync(path.join(__dirname,'../lib/comandas.ts'),'utf8');
const contexto=vm.createContext({exports:{}});
vm.runInContext(ts.transpileModule(fuente,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,contexto);
const {prepararComandas,documentoComandas}=contexto.exports;
const producto=(nombre,id=1,categoria='Lado 1')=>({id,nombre,categoria:{nombre:categoria},aceptaAdicionales:true});
const detalle=(p,mas={})=>({producto:p,productoId:p.id,cantidad:1,exclusiones:[],adicionales:[],...mas});
test('divide los nueve grupos solicitados en dos comandas sin duplicar líneas',()=>{
  const nombres=['Hamburguesas','CHUZO','Arepa burguer','Quesadilla','Perros','Chorizo','Suiza','Salchipapas','Batata'];
  const grupos=prepararComandas({numero:'P-1',detalles:nombres.map((n,i)=>detalle(producto(n,i+1)))},1);
  assert.equal(grupos.length,2);assert.equal(grupos[0].ladoNombre,'PLANCHA');assert.equal(grupos[0].detalles.length,4);
  assert.equal(grupos[1].ladoNombre,'VAPORERA');assert.equal(grupos[1].detalles.length,5);
  assert.equal(new Set(grupos.flatMap(g=>g.detalles.map(d=>d.productoId))).size,9);
});
test('recupera categoría del catálogo cuando crear pedido devuelve solo producto',()=>{
  const p=producto('Especial de la casa',77,'Salchipapas');
  const grupos=prepararComandas({detalles:[detalle({id:77,nombre:p.nombre})]},1,[p]);
  assert.equal(grupos[0].ladoNombre,'VAPORERA');
});
test('conserva notas, cantidades, exclusiones, adicionales y consumo, sin bebidas ni comandas vacías',()=>{
  const d=detalle(producto('Hamburguesa'),{cantidad:3,observacion:'Sin sal',tipoConsumo:'PARA_LLEVAR',exclusiones:['cebolla'],adicionales:[{nombre:'Queso',cantidad:2}]});
  const grupos=prepararComandas({detalles:[d,detalle(producto('Coca Cola',2,'Bebidas'))]},1);
  assert.equal(grupos.length,1);assert.equal(grupos[0].detalles[0].cantidad,3);assert.equal(grupos[0].detalles[0].observacion,'Sin sal');
  const html=documentoComandas(grupos,'Trailer');
  for(const texto of ['PLANCHA','PARA LLEVAR','cebolla','Queso ×2','Sin sal'])assert.ok(html.includes(texto));
  assert.equal(prepararComandas({detalles:[detalle(producto('Agua',4,'Bebidas'))]},1).length,0);
});
test('la categoría de la familia prevalece sobre nombres de ingredientes y no omite comida por aceptar adicionales=false',()=>{
  assert.equal(prepararComandas({detalles:[detalle(producto('Perro chuzo',1,'Perros'))]},1)[0].ladoNombre,'VAPORERA');
  assert.equal(prepararComandas({detalles:[detalle({...producto('Batata'),aceptaAdicionales:false})]},1).length,1);
});
test('otros negocios conservan su separación por lados',()=>{
  const grupos=prepararComandas({detalles:[detalle(producto('Hamburguesa',1,'Lado 2'))]},2);
  assert.equal(grupos[0].ladoNombre,'LADO 2');
});
test('documento contiene dos páginas y escapa el texto ingresado en notas',()=>{
  const grupos=prepararComandas({numero:'42',detalles:[detalle(producto('Hamburguesa'),{observacion:'<script>peligro</script>'}),detalle(producto('Perro',2))]},1);
  const html=documentoComandas(grupos,'Trailer & Sabor');
  assert.equal((html.match(/<section>/g)||[]).length,2);assert.ok(html.includes('break-after:page'));
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Trailer &amp; Sabor'));
});


test('respeta la asignación del administrador sobre nombre, categoría y adicionales',()=>{
 const productos=[producto('AREPA BURGER SENCILLA',516,'AREPAS'),producto('PERRO SENCILLO',507,'PERRO')];
 const pedido={detalles:productos.map(p=>detalle(p))};
 const grupos=prepararComandas(pedido,1,[],{'516':'VAPORERA','507':'PLANCHA'});
 assert.equal(grupos.find(g=>g.ladoNombre==='PLANCHA').detalles[0].productoId,507);
 assert.equal(grupos.find(g=>g.ladoNombre==='VAPORERA').detalles[0].productoId,516);
 assert.equal(prepararComandas(pedido,1,[],{'516':'SIN_COMANDA','507':'VAPORERA'}).length,1);
 assert.equal(prepararComandas(pedido,1).length,2);
 assert.equal(prepararComandas(pedido,2,[],{'516':'SIN_COMANDA'})[0].detalles.length,2);
});
