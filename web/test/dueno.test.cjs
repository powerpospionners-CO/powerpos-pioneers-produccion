const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('la app instalada ofrece accesos a Mi negocio, Mesas y POS',()=>{
 const m=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
 assert.deepEqual(m.shortcuts.map(s=>s.url),['/dueno','/mesas','/pos']);
 assert.equal(m.start_url,'/pos');
});
test('Mi negocio es solo para administrador y gerente y se actualiza sola el día de hoy',()=>{
 assert.match(fs.readFileSync('components/Navbar.tsx','utf8'),/item\.href === '\/dueno' && !esAdminOGerente/);
 const p=fs.readFileSync('app/dueno/page.tsx','utf8');
 assert.match(p,/if \(fecha !== hoy\(\)\) return;/);
 assert.match(p,/setInterval\(cargar, 60000\)/);
});
test('en arqueo ciego la calculadora solo muestra lo contado',()=>{
 const c=fs.readFileSync('components/CalculadoraBilletes.tsx','utf8');
 assert.match(c,/\{!sinObjetivo && <>/);
 assert.match(fs.readFileSync('components/CajaControl.tsx','utf8'),/sinObjetivo=\{ciego\}/);
});
