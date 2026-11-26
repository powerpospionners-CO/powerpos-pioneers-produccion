const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ts=require('typescript');
const cargar=(ruta)=>{const m={exports:{}};new Function('exports','module',ts.transpile(fs.readFileSync(ruta,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}))(m.exports,m);return m.exports;};
const {agruparPorZona,colorMesa,porPersona}=cargar('lib/mesas.ts');
const {esPerfilMesero}=cargar('lib/mesero.ts');
test('el plano se agrupa por zona y colorea las mesas según su estado',()=>{
 const libre={numero:1,zona:'Salón',cuenta:null},ocupada={numero:2,zona:'Terraza',cuenta:{listas:0}},lista={numero:3,zona:'Salón',cuenta:{listas:1}};
 assert.deepEqual(agruparPorZona([libre,ocupada,lista]).map(([z,l])=>[z,l.map(m=>m.numero)]),[['Salón',[1,3]],['Terraza',[2]]]);
 assert.match(colorMesa(libre),/gray/);assert.match(colorMesa(ocupada),/orange/);assert.match(colorMesa(lista),/green/);
 assert.equal(porPersona(100000,3),33334);
});
test('el perfil mesero solo aplica a cajeros y lo lleva a Mesas',()=>{
 assert.equal(esPerfilMesero({rol:'CAJERO',permisosUsuario:{perfil:'MESERO'}}),true);
 assert.equal(esPerfilMesero({rol:'GERENTE',permisosUsuario:{perfil:'MESERO'}}),false);
 assert.equal(esPerfilMesero({rol:'CAJERO',permisosUsuario:{pos:true}}),false);
 assert.match(fs.readFileSync('app/login/page.tsx','utf8'),/esPerfilMesero\(usuario\) \? '\/mesas'/);
 assert.match(fs.readFileSync('components/Navbar.tsx','utf8'),/if \(esMesero\) return item\.href === '\/mesas';/);
});
test('el cobro de la mesa reutiliza la clave al reintentar y la cocina ve las rondas',()=>{
 const pagina=fs.readFileSync('app/mesas/page.tsx','utf8');
 assert.match(pagina,/claveIdempotencia: cobro\.clave/);
 assert.match(pagina,/status >= 400 && e\?\.response\?\.status < 500\) setCobro/);
 assert.match(fs.readFileSync('app/cocina/page.tsx','utf8'),/<RondasMesas \/>/);
});
