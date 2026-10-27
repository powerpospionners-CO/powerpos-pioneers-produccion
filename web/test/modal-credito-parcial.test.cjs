const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function hijos(n,pred){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(x=>hijos(x,pred));return [...(pred(n)?[n]:[]),...hijos(n.props?.children,pred)];}
function texto(n){if(n===null||n===undefined||typeof n==='boolean')return'';if(typeof n!=='object')return String(n);return Array.isArray(n)?n.map(texto).join(''):texto(n.props?.children);}
function modal(cambios={}){
  const state=[],confirmados=[];let i=0;
  const modulo={exports:{}};
  const react={useState:v=>{const indice=i++;if(!(indice in state))state[indice]=v;return[state[indice],valor=>state[indice]=typeof valor==='function'?valor(state[indice]):valor];},useMemo:fn=>fn(),useEffect:()=>{}};
  const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/ModalCobro.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{module:modulo,exports:modulo.exports,Intl,Date,require:n=>n==='react'?react:n==='@/lib/formato'?{moneda:n=>'$'+n}:n==='next/image'||n==='./MontoRecibido'?{default:'div'}:require(n)});
  const props={total:172000,permitirCredito:true,onConfirmar:p=>confirmados.push(p),onCancelar:()=>{},borradorInicial:{credito:false,mixto:true,vencimiento:'2099-01-01',metodoUnico:'EFECTIVO',recibidoUnico:0,bancoTransferencia:'TRANSFERENCIA',lineas:[{metodoPago:'NEQUI',monto:'31400'},{metodoPago:'EFECTIVO',monto:'90600'}],recibidosMixto:{1:90600}},...cambios};
  return{confirmados,render(){i=0;return modulo.exports.default(props);}};
}
test('permite dejar exactamente 50.000 a crédito conservando Nequi y efectivo',()=>{
  const p=modal();let arbol=p.render();
  const restante=hijos(arbol,n=>n.type==='button'&&texto(n).includes('restantes a crédito'))[0];
  assert.match(texto(restante),/50000/);restante.props.onClick();arbol=p.render();
  assert.match(texto(arbol),/Abono de hoy: \$122000 · Saldo a crédito: \$50000/);
  const confirmar=hijos(arbol,n=>n.type==='button'&&texto(n)==='Registrar crédito')[0];assert.equal(confirmar.props.disabled,false);confirmar.props.onClick();
  assert.equal(JSON.stringify(p.confirmados[0]),JSON.stringify({metodoPago:'CREDITO',pagos:[{metodoPago:'NEQUI',monto:31400},{metodoPago:'EFECTIVO',monto:90600}],cambio:0,condicionPago:'CREDITO',vencimientoCredito:'2099-01-01'}));
});
test('sin cliente no ofrece asignar el saldo a crédito',()=>{
  const p=modal({permitirCredito:false});assert.equal(hijos(p.render(),n=>n.type==='button'&&texto(n).includes('restantes a crédito')).length,0);
});
test('marcar crédito después de dividir el pago conserva los abonos ya escritos',()=>{
  const p=modal();const casilla=hijos(p.render(),n=>n.type==='input'&&n.props.type==='checkbox')[0];casilla.props.onChange({target:{checked:true}});
  const arbol=p.render();assert.match(texto(arbol),/Abono de hoy: \$122000 · Saldo a crédito: \$50000/);
  hijos(arbol,n=>n.type==='button'&&texto(n)==='Registrar crédito')[0].props.onClick();assert.equal(p.confirmados[0].pagos.length,2);
});
test('conserva el crédito completo sin abonos y exige vencimiento',()=>{
  const p=modal({borradorInicial:{credito:true,vencimiento:'2099-01-01',lineas:[],recibidosMixto:{}}});
  const confirmar=hijos(p.render(),n=>n.type==='button'&&texto(n)==='Registrar crédito')[0];confirmar.props.onClick();assert.equal(p.confirmados[0].pagos.length,0);
  const sinFecha=modal({borradorInicial:{credito:true,vencimiento:'',lineas:[],recibidosMixto:{}}});assert.equal(hijos(sinFecha.render(),n=>n.type==='button'&&texto(n)==='Registrar crédito')[0].props.disabled,true);
});
