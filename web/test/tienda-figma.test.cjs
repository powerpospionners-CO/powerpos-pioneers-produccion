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
 const html=renderToStaticMarkup(React.createElement(Tienda,{tienda:datos,slug:'ferreteria'}));
 for(const className of ['site-header','hero-copy','hero-visual','category-grid','product-grid','about-section','contact-card','cart-drawer','chat-fab'])assert.ok(html.includes(className),className);
 assert.ok(html.indexOf('id="productos"')<html.indexOf('id="nosotros"'));
 assert.ok(html.includes('Ferretería Azul'));assert.ok(html.includes('#164ccc'));
 assert.ok(!html.includes('573106843264'));assert.ok(!html.includes('México'));assert.ok(!html.includes('Boceto de comercio electrónico'));
});
test('respeta disponibilidad y no inventa países ni productos del boceto',()=>{
 const html=renderToStaticMarkup(React.createElement(Tienda,{tienda:datos,slug:'ferreteria'}));
 assert.ok(html.includes('Martillo'));assert.ok(html.includes('Agotado'));assert.match(html,/class="add-button" disabled=""/);
 assert.ok(!html.includes('Salsa de chile'));assert.ok(!html.includes('Picante alto'));assert.ok(!html.includes('country-badge'));
});
test('una empresa sin productos mantiene la plantilla y ofrece ayuda sin fallar',()=>{
 const html=renderToStaticMarkup(React.createElement(Tienda,{tienda:{...datos,productos:[]},slug:'nueva'}));
 assert.ok(html.includes('No encontramos ese producto'));assert.ok(html.includes('Consultar por chat'));
});
