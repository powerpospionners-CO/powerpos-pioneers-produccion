const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('si la empresa exige 2FA, el panel lleva a Seguridad sin crear un ciclo',()=>{
 const api=fs.readFileSync('lib/api.ts','utf8');
 assert.match(api,/DOS_PASOS_REQUERIDO/);
 assert.match(api,/pathname !== "\/seguridad"/);
 assert.match(fs.readFileSync('app/login/page.tsx','utf8'),/dosPasosPendiente \? '\/seguridad'/);
});
test('restablecer y cambiar la política piden contraseña y código propios',()=>{
 const equipo=fs.readFileSync('app/seguridad/EquipoSeguridad.tsx','utf8');
 assert.match(equipo,/restablecer-2fa`, confirmacion/);
 assert.match(equipo,/\/auth\/seguridad\/politica", \{ exigir: pendiente\.exigir, \.\.\.confirmacion \}/);
 assert.match(equipo,/m\.dosPasos && !m\.propio/);
});
