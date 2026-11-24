const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const handlers={ts:require.extensions['.ts'],tsx:require.extensions['.tsx'],css:require.extensions['.css']};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,p);
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
