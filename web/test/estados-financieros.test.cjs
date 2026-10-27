const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');

function pantalla() {
  const valores = [], peticiones = [];
  let indice = 0, previas, pendiente, limpiar;
  const hooks = {
    useState(inicial) { const i=indice++; if (!(i in valores)) valores[i]=inicial; return [valores[i], valor=>{ valores[i]=typeof valor==='function'?valor(valores[i]):valor; }]; },
    useEffect(fn,deps) { if (!previas || deps.some((d,i)=>!Object.is(d,previas[i]))) { previas=deps; pendiente=fn; } },
  };
  const modulo = { exports:{} };
  const codigo = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/EstadosFinancieros.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(codigo,{module:modulo,exports:modulo.exports,AbortController,Intl,Date,require:nombre=>nombre==='react'?hooks:nombre==='@/lib/api'?{default:{get:()=>new Promise((resolve,reject)=>peticiones.push({resolve,reject}))}}:require(nombre)});
  return {
    peticiones,
    render(hasta='2026-10-26T12:00:00Z') {
      indice=0;
      const html=renderToStaticMarkup(modulo.exports.default({desde:'2026-10-01',hasta}));
      if (pendiente) { limpiar?.(); const fn=pendiente; pendiente=null; limpiar=fn(); }
      return html;
    },
  };
}
const datos={resultado:{completo:true,ventasNetas:100000,costoVentas:40000,utilidadBruta:60000,otrosIngresos:0,gastos:10000,resultadoNeto:50000},balance:{},flujo:{}};
const completar=()=>new Promise(resolve=>setImmediate(resolve));

test('el refresco mantiene el informe y sus secciones mientras llega la siguiente respuesta',async()=>{
  const p=pantalla();
  assert.match(p.render(),/Calculando los estados/);
  p.peticiones[0].resolve({data:datos});await completar();
  assert.match(p.render(),/Resultado neto registrado/);
  p.render('2026-10-26T12:00:10Z');
  const durante=p.render('2026-10-26T12:00:10Z');
  assert.match(durante,/Resultado neto registrado/);
  assert.doesNotMatch(durante,/Calculando los estados/);
  assert.match(durante,/aria-busy="true"/);
  p.peticiones[1].resolve({data:{...datos,resultado:{...datos.resultado,resultadoNeto:55000}}});await completar();
  assert.match(p.render('2026-10-26T12:00:10Z'),/55\.000/);
});
test('un error de actualización conserva los datos y permite reintentar',async()=>{
  const p=pantalla();p.render();p.peticiones[0].resolve({data:datos});await completar();
  p.render('2026-10-26T12:00:10Z');p.peticiones[1].reject(new Error('Sin red'));await completar();
  const html=p.render('2026-10-26T12:00:10Z');
  assert.match(html,/Resultado neto registrado/);assert.match(html,/Datos anteriores/);assert.match(html,/reintentar/);
});
test('una respuesta antigua cancelada no reemplaza el periodo elegido después',async()=>{
  const p=pantalla();p.render();p.render('2026-10-26T12:00:10Z');
  p.peticiones[1].resolve({data:datos});await completar();
  p.peticiones[0].resolve({data:{...datos,resultado:{...datos.resultado,resultadoNeto:999999}}});await completar();
  const html=p.render('2026-10-26T12:00:10Z');assert.match(html,/50\.000/);assert.doesNotMatch(html,/999\.999/);
});
