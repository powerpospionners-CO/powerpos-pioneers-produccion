const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('un administrador nuevo inicia sesión en el portal actual aunque su tienda tenga un UUID', async () => {
  const usuario = { rol: 'ADMIN_EMPRESA', nombre: 'Cristian Rodríguez', tiendaSlug: 'a2414b84-f5da-4a0a-8705-e68f5dea50cc' };
  const navegaciones = [], sesiones = [];
  const modulo = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/login/page.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(codigo, {
    module: modulo, exports: modulo.exports,
    window: { location: { hostname: 'app.powerpospioneers.com', set href(_) { throw Error('Intentó abandonar el portal'); } } },
    require: nombre => {
      if (nombre === 'react') return { useState: v => [v, () => {}], useEffect: () => {} };
      if (nombre === 'next/navigation') return { useRouter: () => ({ push: ruta => navegaciones.push(ruta) }) };
      if (nombre === '@/store/authStore') return { useAuthStore: () => ({ setAuth: (...args) => sesiones.push(args) }) };
      if (nombre === '@/lib/api') return { default: { post: async () => ({ data: { access_token: 'token', usuario } }) } };
      if (nombre === '@/components/ThemeProvider') return { useTema: () => ({ tema: 'claro' }) };
      if (nombre === '@/components/TouchKeyboard') return { default: () => null };
      return require(nombre);
    },
  });
  function buscarFormulario(nodo) {
    if (!nodo || typeof nodo !== 'object') return;
    if (nodo.type === 'form') return nodo;
    return [nodo.props?.children].flat(Infinity).map(buscarFormulario).find(Boolean);
  }
  const formulario = buscarFormulario(modulo.exports.default());
  assert.ok(formulario);
  await formulario.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(navegaciones, ['/dashboard']);
  assert.equal(sesiones[0][0], 'token');
  assert.equal(sesiones[0][1], usuario);
});
