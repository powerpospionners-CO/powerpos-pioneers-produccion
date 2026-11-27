const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('el superadministrador puede restablecer la 2FA de cada administrador desde su panel',()=>{
 assert.match(fs.readFileSync('app/superadmin/page.tsx','utf8'),/<RestablecerDosPasosAdmin empresaId=\{seleccionada\.id\} email=\{admin\.email\}/);
 const c=fs.readFileSync('components/soporte/RestablecerDosPasosAdmin.tsx','utf8');
 assert.match(c,/\/auth\/seguridad\/superadmin\/restablecer-2fa/);
 assert.match(c,/minLength=\{10\}/);
});
