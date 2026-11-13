const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function pagina(tienda) {
  const m = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync('app/tienda/[slug]/page.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const cargar = (nombre) => {
    if (nombre === 'react') return { cache: (fn) => fn };
    if (nombre === 'next/navigation') return { notFound() { throw Error('404'); } };
    if (nombre === './TiendaCliente') return { default: () => null };
    if (nombre.endsWith('/seoTienda')) return { slugPublico: () => true, jsonSeguro: (x) => JSON.stringify(x).replace(/</g, '\\u003c') };
    if (nombre.endsWith('/urlPublicaTienda')) return { urlPublicaTienda: async (slug) => `https://${slug}.powerpospioneers.com/` };
    return require(nombre);
  };
  new Function('exports', 'require', 'fetch', codigo)(m.exports, cargar, async () => ({ ok: true, json: async () => tienda }));
  return m.exports;
}
test('cada empresa comunica su nombre y logo sin heredar la marca ni el manifest del panel', async () => {
  for (const nombre of ['Enchila Market Pereira', 'Trailer del Sabor']) {
    const tienda = { nombre, logo: 'https://imagenes.example/logo.png', config: { descripcion: '' }, productos: [] };
    const p = pagina(tienda);
    const props = { params: Promise.resolve({ slug: 'empresa' }) };
    const meta = await p.generateMetadata(props);
    assert.equal(meta.title.absolute, `${nombre} · Tienda en línea`);
    assert.equal(meta.openGraph.siteName, nombre);
    assert.equal(meta.applicationName, nombre);
    assert.equal(meta.appleWebApp.title, nombre);
    assert.equal(meta.manifest, null);
    assert.equal(meta.icons.icon, tienda.logo);
    const contenido = await p.default(props);
    const sitio = JSON.parse(contenido.props.children[0].props.dangerouslySetInnerHTML.__html);
    assert.equal(sitio['@type'], 'WebSite');
    assert.equal(sitio.name, nombre);
    assert.equal(sitio.url, 'https://empresa.powerpospioneers.com/');
  }
});
test('una empresa sin logo recibe un icono neutro', async () => {
  const meta = await pagina({ nombre: 'Sin logo', logo: '', config: {} }).generateMetadata({ params: Promise.resolve({ slug: 'empresa' }) });
  assert.equal(meta.icons.icon, '/icons/tienda.svg');
});
