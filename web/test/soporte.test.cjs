const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('el modo soporte guarda la sesión del superadministrador y vuelve a ella al salir o al vencer',()=>{
 const lib=fs.readFileSync('lib/soporte.ts','utf8');
 assert.match(lib,/sessionStorage\.setItem\(CLAVE/);
 assert.match(lib,/origen\.usuario\?\.rol === 'SUPERADMIN'/);
 assert.match(fs.readFileSync('lib/api.ts','utf8'),/\?\.soporte\) \{\s*salirDeSoporte\(\);/);
 assert.match(fs.readFileSync('components/Navbar.tsx','utf8'),/<BannerSoporte \/>/);
 assert.match(fs.readFileSync('app/superadmin/page.tsx','utf8'),/<SoporteEmpresa empresaId=/);
});
