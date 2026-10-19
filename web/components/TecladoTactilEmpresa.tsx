'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowBigUp, Delete, X } from 'lucide-react';
import { useTecladoTactilEmpresa } from '@/lib/useTecladoTactilEmpresa';
import { editarConTeclado, type SeleccionTexto } from '@/lib/edicionTeclado';

type Campo = HTMLInputElement | HTMLTextAreaElement;
const TIPOS = new Set(['text', 'search', 'email', 'password', 'url', 'tel', 'number']);
function editable(elemento: unknown): elemento is Campo {
  return (elemento instanceof HTMLTextAreaElement || elemento instanceof HTMLInputElement && TIPOS.has(elemento.type))
    && !elemento.disabled && !elemento.readOnly && !elemento.closest('[data-teclado-tactil-global]');
}
function etiqueta(campo: Campo) {
  return campo.getAttribute('aria-label') || campo.labels?.[0]?.textContent?.trim() || campo.placeholder || campo.name || 'Escribir';
}
const LETRAS = ['qwertyuiop', 'asdfghjklñ', 'zxcvbnm'];
const SIMBOLOS = [['@', '#', '$', '%', '&', '*', '-', '_', '+', '/'], ['(', ')', '[', ']', ':', ';', '=', '¿', '?', '!'], ['¡', ',', '.', '"', "'", '\\', '~']];

export default function TecladoTactilEmpresa() {
  const habilitado = useTecladoTactilEmpresa();
  const [campo, setCampo] = useState<Campo | null>(null);
  const ultimoCampo = useRef<Campo | null>(null);
  const campoActual = useRef<Campo | null>(null);
  const seleccion = useRef<SeleccionTexto>({ inicio: 0, fin: 0 });
  const [valor, setValor] = useState('');
  const valorActual = useRef('');
  const revision = useRef(0);
  const [mayusculas, setMayusculas] = useState(false);
  const [simbolos, setSimbolos] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const panel = useRef<HTMLDivElement>(null);

  const cerrar = () => {
    campoActual.current = null; setCampo(null); setMensaje('');
    window.dispatchEvent(new Event('powerpos:teclado-cerrado'));
  };

  useEffect(() => {
    if (!habilitado) return;
    const mostrar = (objetivo: Campo) => {
      if (campoActual.current !== objetivo) {
        ultimoCampo.current = objetivo; campoActual.current = objetivo;
        valorActual.current = objetivo.value; setValor(objetivo.value); setCampo(objetivo); setMensaje(''); setSimbolos(false);
        seleccion.current = objetivo instanceof HTMLInputElement && objetivo.type === 'number'
          ? { inicio: 0, fin: objetivo.value.length }
          : { inicio: objetivo.selectionStart ?? objetivo.value.length, fin: objetivo.selectionEnd ?? objetivo.value.length };
      }
    };
    const foco = (event: FocusEvent) => {
      if (editable(event.target)) mostrar(event.target);
      else if (event.target instanceof Element && !event.target.closest('[data-teclado-tactil-global]')) cerrar();
    };
    const tocar = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-teclado-tactil-global]')) return;
      if (editable(event.target)) mostrar(event.target);
      else cerrar();
    };
    const sincronizar = (event: Event) => {
      const actual = campoActual.current;
      if (event.target !== actual || !actual) return;
      valorActual.current = actual.value; setValor(actual.value);
      if (actual.selectionStart != null) seleccion.current = { inicio: actual.selectionStart, fin: actual.selectionEnd ?? actual.selectionStart };
    };
    const seleccionFisica = () => {
      const actual = campoActual.current;
      if (actual && document.activeElement === actual && actual.selectionStart != null)
        seleccion.current = { inicio: actual.selectionStart, fin: actual.selectionEnd ?? actual.selectionStart };
    };
    const abrirAnterior = () => {
      const anterior = editable(document.activeElement) ? document.activeElement : ultimoCampo.current;
      if (anterior && editable(anterior) && anterior.isConnected) { anterior.focus({ preventScroll: true }); mostrar(anterior); }
    };
    document.addEventListener('focusin', foco);
    document.addEventListener('pointerdown', tocar, true);
    document.addEventListener('input', sincronizar);
    document.addEventListener('selectionchange', seleccionFisica);
    document.addEventListener('select', seleccionFisica, true);
    window.addEventListener('powerpos:abrir-teclado', abrirAnterior);
    const observador = new MutationObserver(() => {
      const actual = campoActual.current;
      if (actual && (!actual.isConnected || actual.disabled || actual.readOnly || !actual.getClientRects().length)) cerrar();
    });
    observador.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'readonly', 'hidden', 'style'] });
    if (editable(document.activeElement)) mostrar(document.activeElement);
    return () => {
      document.removeEventListener('focusin', foco); document.removeEventListener('pointerdown', tocar, true);
      document.removeEventListener('input', sincronizar); document.removeEventListener('selectionchange', seleccionFisica);
      document.removeEventListener('select', seleccionFisica, true); window.removeEventListener('powerpos:abrir-teclado', abrirAnterior);
      observador.disconnect(); campoActual.current = null; setCampo(null);
    };
  }, [habilitado]);

  useEffect(() => {
    if (!campo || !panel.current) return;
    const anterior = document.body.style.paddingBottom;
    const actualizar = () => {
      if (!panel.current) return;
      document.body.style.paddingBottom = `${panel.current.offsetHeight}px`;
      const limites = campo.getBoundingClientRect();
      if (limites.bottom > panel.current.getBoundingClientRect().top - 12 || limites.top < 0)
        campo.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    const resize = new ResizeObserver(actualizar); resize.observe(panel.current); actualizar();
    return () => { resize.disconnect(); document.body.style.paddingBottom = anterior; };
  }, [campo]);

  if (!habilitado || !campo) return null;
  const numerico = campo instanceof HTMLInputElement && (campo.type === 'number' || campo.type === 'tel' || ['numeric','decimal','tel'].includes(campo.inputMode));
  const pulsar = (tecla: string) => {
    const actual = campoActual.current;
    if (!actual || !actual.isConnected || actual.disabled || actual.readOnly) { cerrar(); return; }
    const editado = editarConTeclado(valorActual.current, seleccion.current, tecla);
    if (actual.maxLength >= 0 && editado.valor.length > actual.maxLength) return;
    if (actual instanceof HTMLInputElement && actual.type === 'number' && !/^-?\d*(\.\d*)?$/.test(editado.valor)) return;
    const edicion = ++revision.current;
    seleccion.current = { inicio: editado.cursor, fin: editado.cursor };
    valorActual.current = editado.valor; setValor(editado.valor); setMensaje('');
    // Number inputs reject partial decimals. Keep the draft in this panel until
    // it becomes valid, without resetting the controlled form's existing value.
    if (actual instanceof HTMLInputElement && actual.type === 'number' && editado.valor !== '' && (!Number.isFinite(Number(editado.valor)) || editado.valor.endsWith('.'))) return;
    const prototipo = actual instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototipo, 'value')!.set!.call(actual, editado.valor);
    actual.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => {
      if (!actual.isConnected || campoActual.current !== actual || revision.current !== edicion) return;
      valorActual.current = actual.value; setValor(actual.value);
      if (actual.selectionStart != null) actual.setSelectionRange(editado.cursor, editado.cursor);
    });
  };
  const listo = () => {
    if (campo instanceof HTMLInputElement && campo.type === 'number' && valorActual.current !== '' && !Number.isFinite(Number(valorActual.current))) { setMensaje('Completa el número o usa Limpiar.'); return; }
    if (campo instanceof HTMLInputElement && campo.type === 'number' && valorActual.current.endsWith('.')) pulsar('BORRAR');
    campo.blur(); cerrar();
  };
  const siguiente = () => {
    if (campo instanceof HTMLInputElement && campo.type === 'number') {
      if (valorActual.current !== '' && !Number.isFinite(Number(valorActual.current))) { setMensaje('Completa el número o usa Limpiar.'); return; }
      if (valorActual.current.endsWith('.')) pulsar('BORRAR');
    }
    const ambito = campo.closest('[role="dialog"], form') || document;
    const campos = Array.from(ambito.querySelectorAll('input,textarea')).filter((n): n is Campo => editable(n) && n.getClientRects().length > 0);
    const proximo = campos[campos.indexOf(campo)+1];
    if (proximo) proximo.focus(); else listo();
  };
  const tecla = (texto: string, accion = texto, especial = false) => <button key={texto} type="button" aria-label={accion === 'BORRAR' ? 'Borrar último carácter' : accion === 'LIMPIAR' ? 'Limpiar campo' : texto}
    onClick={() => pulsar(accion)} className={`min-h-12 min-w-0 flex-1 rounded-lg px-2 py-3 text-base font-semibold touch-manipulation ${especial ? 'bg-gray-700 text-orange-200' : 'bg-gray-800 text-white active:bg-orange-500/40'}`}>{texto}</button>;
  return <div ref={panel} data-teclado-tactil-global role="region" aria-label="Teclado táctil de Trailer del Sabor" className="fixed inset-x-0 bottom-0 z-[10000] border-t border-orange-500/50 bg-gray-950 p-2 text-white shadow-2xl md:p-3"
    onPointerDown={event => event.preventDefault()}>
    <div className="mx-auto max-w-4xl space-y-2">
      <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs text-gray-300">{etiqueta(campo)}</p><div aria-label="Contenido del campo" className="mt-1 max-h-16 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-900 px-3 py-2 text-lg">{campo.type === 'password' ? '•'.repeat(valor.length) : valor || <span className="text-gray-500">Escribe con el teclado</span>}</div></div><button type="button" aria-label="Cerrar teclado" onClick={cerrar} className="min-h-12 min-w-12 rounded-lg bg-gray-800 p-3"><X /></button></div>
      {mensaje && <p role="alert" className="text-sm text-orange-300">{mensaje}</p>}
      {numerico ? <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">{['1','2','3','4','5','6','7','8','9','00','0','.'].map(t => tecla(t))}</div> : <>
        <div className="flex gap-1">{'1234567890'.split('').map(t => tecla(t))}</div>
        {(simbolos ? SIMBOLOS : LETRAS.map(f => f.split(''))).map((fila,i) => <div key={i} className="flex gap-1">{fila.map(t => tecla(mayusculas && !simbolos ? t.toUpperCase() : t))}</div>)}
        {!simbolos && <div className="flex gap-1">{['á','é','í','ó','ú','ü','@','.'].map(t => tecla(mayusculas ? t.toUpperCase() : t))}</div>}
      </>}
      <div className="flex flex-wrap gap-2">
        {!numerico && <><button type="button" aria-label="Cambiar mayúsculas" onClick={() => setMayusculas(v => !v)} className={`min-h-12 rounded-lg px-4 ${mayusculas ? 'bg-orange-500' : 'bg-gray-800'}`}><ArrowBigUp /></button><button type="button" onClick={() => setSimbolos(v => !v)} className="min-h-12 rounded-lg bg-gray-800 px-4">{simbolos ? 'ABC' : '?123'}</button>{tecla('Espacio',' ')}</>}
        {numerico && campo.type === 'tel' && tecla('+')}
        {numerico && campo instanceof HTMLInputElement && campo.type === 'number' && (campo.min === '' || Number(campo.min) < 0) && tecla('-')}
        {tecla('Limpiar','LIMPIAR',true)}
        <button type="button" aria-label="Borrar último carácter" onClick={() => pulsar('BORRAR')} className="min-h-12 rounded-lg bg-gray-800 px-4"><Delete /></button>
        {campo instanceof HTMLTextAreaElement && tecla('Nueva línea','\n')}
        <button type="button" onClick={siguiente} className="min-h-12 rounded-lg bg-gray-700 px-4">Siguiente</button>
        <button type="button" onClick={listo} className="min-h-12 flex-1 rounded-lg bg-orange-500 px-5 font-bold">Listo</button>
      </div>
    </div>
  </div>;
}
