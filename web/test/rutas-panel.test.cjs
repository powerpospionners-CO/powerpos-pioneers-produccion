const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Toda pantalla del panel debe abrirse también en el dominio propio de la empresa (y no reescribirse a la tienda).
const PUBLICAS=new Set(['tienda','api','superadmin']);
test('cada pantalla del panel está en RUTAS_PANEL y fuera de los buscadores',()=>{
 const proxy=fs.readFileSync('proxy.ts','utf8'),robots=fs.readFileSync('app/robots.ts','utf8');
 const lista=proxy.slice(proxy.indexOf('const RUTAS_PANEL'),proxy.indexOf('];',proxy.indexOf('const RUTAS_PANEL')));
 const paginas=fs.readdirSync('app',{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.name.startsWith('(')&&!d.name.startsWith('[')&&!PUBLICAS.has(d.name)&&fs.existsSync(path.join('app',d.name,'page.tsx'))).map(d=>d.name);
 const faltan=paginas.filter(p=>!lista.includes(`'/${p}'`));
 assert.deepEqual(faltan,[],`Faltan en RUTAS_PANEL: ${faltan.join(', ')}`);
 for(const p of ['mesas','costos','dueno','contabilidad','ayuda']) assert.match(robots,new RegExp(`"/${p}"`));
});
