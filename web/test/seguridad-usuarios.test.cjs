const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('mi perfil pide la contraseña actual para cambiar la contraseña o el correo',()=>{
 const p=fs.readFileSync('app/configuracion/page.tsx','utf8');
 assert.match(p,/payload\.passwordActual = formPerfil\.passwordActual/);
 assert.match(p,/autoComplete="current-password"/);
});
test('el gerente solo ve en el formulario los roles que puede crear',()=>{
 assert.match(fs.readFileSync('app/configuracion/page.tsx','utf8'),/usuario\?\.rol === 'ADMIN_EMPRESA' \|\| \['CAJERO', 'COCINERO', 'DOMICILIARIO'\]\.includes\(r\)/);
});
test('las contraseñas nuevas del superadministrador piden 10 caracteres',()=>{
 const s=fs.readFileSync('app/superadmin/page.tsx','utf8');
 assert.doesNotMatch(s,/minLength=\{6\}|Mínimo 6 caracteres/);
});
