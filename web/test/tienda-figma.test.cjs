const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const handlers={ts:require.extensions['.ts'],tsx:require.extensions['.tsx'],css:require.extensions['.css']};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,p);
require.extensions['.css']=()=>{};
const Tienda=require(path.resolve('app/tienda/[slug]/TiendaFigma.tsx')).default;
for(const ext of ['ts','tsx','css']){if(handlers[ext])require.extensions['.'+ext]=handlers[ext];else delete require.extensions['.'+ext];}
const datos={nombre:'Ferretería Azul',logo:'',telefono:'',direccion:'Bogotá',config:{titulo:'Todo para tu hogar',color:'#164ccc',coloresAutomaticos:true,descripcion:'Nuestro catálogo',sobreNosotros:'',portada:'',whatsapp:'',instagram:'',horario:'',zonas:[],minimo:0,pedidosHabilitados:false},productos:[{id:800,nombre:'Martillo',descripcion:'Acero',precio:'25000',imagen:'https://example.com/martillo.png',disponible:false,categoria:{nombre:'Herramientas'}}]};
test('conserva las secciones, tarjetas, carrito lateral y chat del componente original',()=>{
 const html=['inicio','productos','nosotros','contacto'].map(seccion=>renderToStaticMarkup(React.createElement(Tienda,{tienda:datos,slug:'ferreteria',seccion}))).join('');
 for(const className of ['site-header','hero-copy','hero-visual','category-grid','product-grid','about-section','contact-card','cart-drawer','chat-fab'])assert.ok(html.includes(className),className);
 assert.ok(html.indexOf('id="productos"')<html.indexOf('id="nosotros"'));
 assert.ok(html.includes('Ferretería Azul'));assert.ok(html.includes('#164ccc'));
 assert.ok(!html.includes('573106843264'));assert.ok(!html.includes('México'));assert.ok(!html.includes('Boceto de comercio electrónico'));
});
test('respeta disponibilidad y no inventa países ni productos del boceto',()=>{
 const html=renderToStaticMarkup(React.createElement(Tienda,{tienda:datos,slug:'ferreteria',seccion:'productos'}));
 assert.ok(html.includes('Martillo'));assert.ok(html.includes('Agotado'));assert.match(html,/class="add-button" disabled=""/);
 assert.ok(!html.includes('Salsa de chile'));assert.ok(!html.includes('Picante alto'));assert.ok(!html.includes('country-badge'));
});
test('una empresa sin productos mantiene la plantilla y ofrece ayuda sin fallar',()=>{
 const html=renderToStaticMarkup(React.createElement(Tienda,{tienda:{...datos,productos:[]},slug:'nueva',seccion:'productos'}));
 assert.ok(html.includes('No encontramos ese producto'));assert.ok(html.includes('Consultar por chat'));
});

test('cada página muestra solo su apartado y conserva navegación, carrito y chat', () => {
 const ids = { inicio: 'inicio', productos: 'productos', nosotros: 'nosotros', contacto: 'contacto' };
 for (const seccion of Object.keys(ids)) {
  const html = renderToStaticMarkup(React.createElement(Tienda, { tienda: datos, slug: 'ferreteria', seccion }));
  for (const [otra, id] of Object.entries(ids)) assert.equal(html.includes(`id="${id}"`), otra === seccion, `${seccion}: ${otra}`);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert(html.includes('cart-drawer')); assert(html.includes('chat-fab'));
  assert(html.includes('href="/tienda/ferreteria/productos"')); assert(html.includes('aria-current="page"'));
 }
});
test('el título largo permite saltos y la portada propia se muestra sin recortar', () => {
 const html = renderToStaticMarkup(React.createElement(Tienda, { tienda: { ...datos, config: { ...datos.config, titulo: 'ENCHILA MARKET PEREIRA/DOSQUEBRADAS', portada: 'https://example.com/logo.png' } }, slug: 'ferreteria' }));
 assert(html.includes('custom-cover')); assert(html.includes('<wbr/>')); assert(html.includes('DOSQUEBRADAS'));
});
test('contacto solo ofrece canales configurados y separa etiqueta y dato', () => {
 const html = renderToStaticMarkup(React.createElement(Tienda, { tienda: { ...datos, telefono: '3106843264' }, slug: 'ferreteria', seccion: 'contacto' }));
 assert(html.includes('<small>WhatsApp</small><strong>3106843264</strong>'));
 assert(!html.includes('Por configurar')); assert(!html.includes('>Instagram<'));
});

test('misión y visión solo aparecen en Nosotros y no se inventan textos vacíos', () => {
 const tienda = {...datos, config: {...datos.config, mision: 'Acompañar a nuestros clientes', vision: 'Crecer en nuestra región'}};
 const html = renderToStaticMarkup(React.createElement(Tienda, {tienda, slug:'ferreteria', seccion:'nosotros'}));
 for (const texto of ['Nuestra misión','Nuestra visión',tienda.config.mision,tienda.config.vision]) assert(html.includes(texto));
 const inicio = renderToStaticMarkup(React.createElement(Tienda, {tienda, slug:'ferreteria', seccion:'inicio'}));
 assert(!inicio.includes(tienda.config.mision));
 const vacio = renderToStaticMarkup(React.createElement(Tienda, {tienda:datos, slug:'ferreteria', seccion:'nosotros'}));
 assert(!vacio.includes('Nuestra misión')); assert(!vacio.includes('Nuestra visión'));
});
test('las categorías usan su imagen elegida sin cambiar la foto del producto', () => {
 const tienda = {...datos, productos:datos.productos.map(p=>({...p,categoriaId:9})), config:{...datos.config,imagenesCategorias:[{categoriaId:9,imagen:'https://example.com/categoria.png'}]}};
 const html = renderToStaticMarkup(React.createElement(Tienda,{tienda,slug:'ferreteria',seccion:'productos'}));
 assert(html.includes('https://example.com/categoria.png'), html.slice(html.indexOf('category-grid'), html.indexOf('category-grid')+900)); assert(html.includes('https://example.com/martillo.png'));
});

test('galería en Nosotros y dudas y entregas en Contacto sin mezclar páginas', () => {
 const tienda={...datos,config:{...datos.config,galeria:[{imagen:'https://example.com/local.png',descripcion:'Nuestro local'}],preguntasFrecuentes:[{pregunta:'¿Cuánto tarda el envío?',respuesta:'Se confirma al aceptar tu pedido.'}],envios:'Entregamos en nuestra ciudad',pagos:'Efectivo y tarjeta'}};
 const render=seccion=>renderToStaticMarkup(React.createElement(Tienda,{tienda,slug:'ferreteria',seccion}));
 const nosotros=render('nosotros'), contacto=render('contacto'), inicio=render('inicio');
 assert(nosotros.includes('https://example.com/local.png')); assert(!contacto.includes('https://example.com/local.png'));
 assert(contacto.includes('<details><summary>¿Cuánto tarda el envío?</summary>')); assert(contacto.includes('Entregamos en nuestra ciudad')); assert(contacto.includes('Efectivo y tarjeta'));
 assert(!nosotros.includes('¿Cuánto tarda el envío?')); assert(!inicio.includes('https://example.com/local.png'));
});

test('cada mapa usa la dirección propia y no aparece cuando falta la dirección', () => {
 const render = (direccion,seccion='contacto')=>renderToStaticMarkup(React.createElement(Tienda,{tienda:{...datos,direccion},slug:'ferreteria',seccion}));
 const direccion='Carrera 16 # 20A - 11, Dosquebradas, Risaralda';
 const html=render(direccion); const query=new URLSearchParams({q:direccion,output:'embed',hl:'es'}).toString().replaceAll('&','&amp;');
 assert(html.includes('https://www.google.com/maps?'+query)); assert(html.includes('Cómo llegar')); assert(html.includes('destination=Carrera+16+%23+20A'));
 assert(!render('').includes('<iframe')); assert(!render(direccion,'inicio').includes('<iframe'));
 assert(!render('Bogotá').includes('Dosquebradas'));
});
