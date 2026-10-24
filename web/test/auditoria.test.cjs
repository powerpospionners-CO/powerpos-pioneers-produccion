const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const modulo = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/auditoria.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: modulo, exports: modulo.exports });
const { describirAuditoria } = modulo.exports;
const registro = detalle => ({ id: 1, creadoEn: '2026-10-24T17:41:33Z', accion: 'OPERACION', detalle: { estado: 201, actor: { nombre: 'Persona de prueba', rol: 'ADMIN_EMPRESA' }, ...detalle } });

test('traduce navegación e inicio de sesión sin mostrar rutas ni códigos técnicos', () => {
  const vista = describirAuditoria({ ...registro({ metodo: 'POST', ruta: '/actividad/vista', campos: ['ruta'], cambio: { pantalla: '/auditoria' } }), accion: 'PANTALLA' });
  assert.equal(vista.titulo, 'Abrió Auditoría');
  assert.equal(vista.rol, 'Administrador');
  assert.equal(vista.campos.length, 0);
  const login = describirAuditoria(registro({ metodo: 'POST', ruta: '/auth/login', campos: ['email'] }));
  assert.equal(login.titulo, 'Inició sesión');
  assert(!JSON.stringify(login).includes('/auth/login'));
});
test('una solicitud de impresión no se presenta como impresión física confirmada', () => {
  const impresion = describirAuditoria(registro({ metodo: 'POST', ruta: '/impresion/ticket', campos: ['precio', 'costo', 'password', 'detalles', 'total'] }));
  assert.equal(impresion.titulo, 'Solicitó imprimir un recibo');
  assert.match(impresion.descripcion, /no confirma/);
  assert.equal(impresion.campos.length, 0);
});
test('muestra el cambio del sabor y sus códigos antes y después', () => {
  const cambio = describirAuditoria(registro({ metodo: 'PATCH', ruta: '/acceso-barras/productos/:id', recursoId: 4, cambio: { tipo: 'SABOR', nombre: 'Refresco · Mango', anterior: null, nuevo: '770123' } }));
  assert.equal(cambio.titulo, 'Cambió el código de un sabor');
  assert.equal(cambio.cambio.anterior, 'Sin código');
  assert.equal(cambio.cambio.nuevo, '770123');
  assert.equal(cambio.referencia, 'Producto n.º 4');
});
test('los errores no afirman que se guardaron los cambios', () => {
  const intento = describirAuditoria(registro({ estado: 409, metodo: 'PATCH', ruta: '/acceso-barras/productos/:id', cambio: { nuevo: '770123' } }));
  assert.equal(intento.estado, 'No completado');
  assert.equal(intento.cambio, null);
  assert.match(intento.descripcion, /no confirma/);
});
test('los campos se traducen y se omiten nombres desconocidos o secretos', () => {
  const edicion = describirAuditoria(registro({ metodo: 'PATCH', ruta: '/usuarios/:id', campos: ['nombre', 'email', 'rol', 'password', 'jwtSecret', 'nombre', 'sucursalId'] }));
  assert.equal(edicion.titulo, 'Editó un usuario');
  assert.equal(Array.from(edicion.campos).join(', '), 'Nombre, Correo electrónico, Rol, Sucursal');
});
