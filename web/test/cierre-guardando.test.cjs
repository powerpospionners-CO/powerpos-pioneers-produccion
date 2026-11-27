const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Toda pantalla que abre la ventana "Guardando cambios" debe cerrarla en un finally, también cuando falla.
function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? archivos(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : [],
  );
}

test('cada iniciarGuardado tiene su terminarCarga en un finally', () => {
  const sinCerrar = [];
  for (const f of [...archivos('app'), ...archivos('components')]) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/const (\w+) = iniciarGuardado\(\);/g)) {
      const resto = s.slice(m.index + m[0].length);
      const siguiente = resto.indexOf('iniciarGuardado()');
      const cuerpo = siguiente > 0 ? resto.slice(0, siguiente) : resto;
      const cierre = new RegExp('finally \\{[\\s\\S]{0,300}?terminarCarga\\(' + m[1] + '\\)');
      if (!cierre.test(cuerpo)) sinCerrar.push(f);
    }
  }
  assert.deepEqual(sinCerrar, [], `No cierran la ventana: ${sinCerrar.join(', ')}`);
});
