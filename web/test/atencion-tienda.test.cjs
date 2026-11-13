const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs');
const modulo={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('lib/atencionTienda.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(modulo.exports);
const {responderTienda}=modulo.exports;
const tienda={nombre:'Mercado Azul',telefono:'3100000000',direccion:'Calle 1',config:{horario:'Lunes de 8 a 17',pagos:'Efectivo y tarjeta',envios:'Entrega de lunes a viernes',zonas:[{nombre:'Centro',costo:5000}],minimo:20000,pedidosHabilitados:false},productos:[{id:7,nombre:'Café molido',descripcion:'Tostión media',precio:'14500',disponible:true,origen:'Colombiano',categoria:{nombre:'Bebidas'}},{id:8,nombre:'Salsa picante',descripcion:'Chile rojo',precio:'9000',disponible:false,origen:'Mexicano',categoria:{nombre:'Salsas'}}]};
test('contesta preguntas naturales con precios y disponibilidad del producto exacto',()=>{
 const r=responderTienda('Hola, ¿cuánto cuesta el café?',tienda);
 assert.deepEqual(r.productoIds,[7]);assert.match(r.texto,/14.500/);assert.match(r.texto,/Colombiano/);
 assert.match(responderTienda('¿Tienen salsa picante?',tienda).texto,/Agotado/);
 assert.match(responderTienda('¿Y cuánto cuesta?',tienda,[7]).texto,/14.500/);
});
test('usa información de la empresa para horarios, ubicación, pago, entrega y orígenes',()=>{
 for(const [q,texto] of [['¿A qué hora abren?','Lunes de 8 a 17'],['¿Cuál es su dirección?','Calle 1'],['¿Puedo pagar con tarjeta?','Efectivo y tarjeta'],['¿Hacen domicilios?','Centro'],['¿Qué orígenes tienen?','Mexicano']])assert.ok(responderTienda(q,tienda).texto.includes(texto),q);
});
test('no inventa respuestas ni usa productos de otras tiendas',()=>{
 const vacia={...tienda,nombre:'Otra empresa',productos:[],config:{...tienda.config,horario:''}};
 assert.equal(responderTienda('¿Cuánto cuesta el café?',vacia).derivar,true);
 assert.ok(!responderTienda('café',vacia).texto.includes('14.500'));
 assert.match(responderTienda('¿A qué hora abren?',vacia).texto,/no ha publicado/);
 assert.equal(responderTienda('¿Sirve para curar diabetes?',tienda).derivar,true);
});

