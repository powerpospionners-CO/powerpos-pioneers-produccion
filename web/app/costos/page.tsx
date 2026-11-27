'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, DollarSign, Package, ShoppingCart, TrendingUp } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { exportarCsv } from '@/lib/csv';
import { Aviso, Indicador, Pagina, Pestanas, Tarjeta, Vacio, ui } from '@/components/ui/Panel';

type Pestana = 'platos' | 'kardex' | 'compra' | 'vencimientos';
const PESTANAS = [['platos', 'Costo por plato'], ['kardex', 'Kardex'], ['compra', 'Compra sugerida'], ['vencimientos', 'Vencimientos y mermas']] as const;
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const haceDias = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(Date.now() - n * 86400000));
const error = (e: any) => e?.response?.data?.message || 'No se pudo consultar';
const num = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? '—' : n.toLocaleString('es-CO', { maximumFractionDigits: d }));
const Chip = ({ tono, children }: { tono: 'amarillo' | 'rojo' | 'gris'; children: React.ReactNode }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs ${{ amarillo: 'bg-yellow-500/10 text-yellow-400', rojo: 'bg-red-500/10 text-red-400', gris: 'bg-gray-800 text-gray-400' }[tono]}`}>{children}</span>
);

export default function CostosPage() {
  const [pestana, setPestana] = useState<Pestana>('platos');
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col text-white">
        <Navbar />
        <Pagina titulo="Costos e inventario" descripcion="Cuánto te cuesta cada plato, por dónde se mueve cada producto y qué comprar.">
          <Pestanas opciones={PESTANAS} valor={pestana} onCambio={setPestana} />
          {pestana === 'platos' && <Platos />}
          {pestana === 'kardex' && <Kardex />}
          {pestana === 'compra' && <Compra />}
          {pestana === 'vencimientos' && <Vencimientos />}
        </Pagina>
      </div>
    </AuthGuard>
  );
}

function Platos() {
  const [dias, setDias] = useState(30);
  const [umbral, setUmbral] = useState(30);
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const consultar = () => api.get('/costos/platos', { params: { dias, umbral } }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(error(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void consultar(); }, []);
  const filas = (datos?.productos || []).filter((p: any) => !soloAlertas || p.alerta);
  const conAlerta = (datos?.productos || []).filter((p: any) => p.alerta).length;
  const ventas = (datos?.productos || []).reduce((s: number, p: any) => s + p.ventas, 0);
  const utilidad = (datos?.productos || []).reduce((s: number, p: any) => s + (p.utilidad || 0), 0);
  return (
    <div className="space-y-6">
      {datos && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Indicador icono={DollarSign} etiqueta={`Ventas de ${datos.dias} días`} valor={moneda(ventas)} />
          <Indicador icono={TrendingUp} etiqueta="Utilidad con costo registrado" valor={moneda(utilidad)} tono="verde" />
          <Indicador icono={AlertTriangle} etiqueta="Productos con alerta" valor={conAlerta} tono={conAlerta ? 'amarillo' : 'gris'} />
        </div>
      )}
      {falla && <Aviso tipo="error">{falla}</Aviso>}
      <Tarjeta sinRelleno titulo="Costo y margen por producto" acciones={
        <>
          <div><label className={ui.etiqueta}>Ventas de</label><select className={ui.input} value={dias} onChange={(e) => setDias(Number(e.target.value))}><option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option></select></div>
          <div><label className={ui.etiqueta}>Margen mínimo (%)</label><input type="number" min={0} max={100} className={`${ui.input} w-28`} value={umbral} onChange={(e) => setUmbral(Number(e.target.value))} /></div>
          <button type="button" className={ui.primario} onClick={() => void consultar()}>Consultar</button>
          {datos && <button type="button" className={ui.secundario} onClick={() => exportarCsv('costo-por-plato.csv', ['Producto', 'Categoría', 'Precio', 'Costo', 'Margen %', 'Vendidos', 'Ventas', 'Margen real %', 'Utilidad'], filas.map((p: any) => [p.nombre, p.categoria, p.precio, p.costo ?? '', p.margen ?? '', p.vendidos, p.ventas, p.margenReal ?? '', p.utilidad ?? '']))}>Exportar CSV</button>}
        </>
      }>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
          <p className="text-xs text-gray-500">El costo sale de la receta (insumos × costo unitario) o del costo del producto. El margen real usa el costo que guardó cada venta.</p>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" className="accent-orange-500" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} /> Solo con alerta</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr><th className={ui.th}>Producto</th><th className={ui.thNum}>Precio</th><th className={ui.thNum}>Costo</th><th className={ui.thNum}>Margen</th><th className={ui.thNum}>Vendidos</th><th className={ui.thNum}>Ventas</th><th className={ui.thNum}>Margen real</th><th className={ui.thNum}>Utilidad</th></tr></thead>
            <tbody>
              {filas.map((p: any) => (
                <tr key={p.id} className={ui.fila}>
                  <td className={ui.td}>
                    <div className="font-medium text-white">{p.nombre}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      {p.categoria}
                      {p.alerta === 'SIN_COSTO' && <Chip tono="amarillo">Falta el costo</Chip>}
                      {p.alerta === 'MARGEN_BAJO' && <Chip tono="rojo">Margen bajo</Chip>}
                    </div>
                    {p.partes.length > 0 && <div className="mt-1 text-xs text-gray-500">{p.partes.map((x: any) => `${x.nombre} ${moneda(x.costo)}`).join(' · ')}</div>}
                  </td>
                  <td className={ui.tdNum}>{moneda(p.precio)}</td>
                  <td className={ui.tdNum}>{p.costo === null ? '—' : moneda(p.costo)}</td>
                  <td className={`${ui.tdNum} ${p.alerta === 'MARGEN_BAJO' ? 'text-red-400' : ''}`}>{p.margen === null ? '—' : `${p.margen} %`}</td>
                  <td className={ui.tdNum}>{p.vendidos}</td>
                  <td className={ui.tdNum}>{moneda(p.ventas)}</td>
                  <td className={ui.tdNum}>{p.margenReal === null ? '—' : `${p.margenReal} %`}</td>
                  <td className={ui.tdNum}>{p.utilidad === null ? '—' : moneda(p.utilidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {datos && !filas.length && <Vacio>No hay productos con ese filtro.</Vacio>}
          {!datos && !falla && <Vacio>Cargando…</Vacio>}
        </div>
      </Tarjeta>
    </div>
  );
}

function Kardex() {
  const [tipo, setTipo] = useState<'PRODUCTO' | 'INGREDIENTE'>('PRODUCTO');
  const [opciones, setOpciones] = useState<{ id: number; nombre: string }[]>([]);
  const [id, setId] = useState('');
  const [rango, setRango] = useState({ desde: haceDias(30), hasta: hoy() });
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  useEffect(() => {
    setId(''); setDatos(null);
    api.get(tipo === 'PRODUCTO' ? '/productos' : '/inventario').then(({ data }) => setOpciones(data.map((x: any) => ({ id: x.id, nombre: x.nombre })))).catch(() => setOpciones([]));
  }, [tipo]);
  const consultar = () => id && api.get('/costos/kardex', { params: { tipo, id, ...rango } }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(error(e)));
  const unidad = datos?.item.unidad || '';
  return (
    <div className="space-y-6">
      <Tarjeta titulo="Elige qué revisar" acciones={
        <>
          <div><label className={ui.etiqueta}>Tipo</label><select className={ui.input} value={tipo} onChange={(e) => setTipo(e.target.value as any)}><option value="PRODUCTO">Producto</option><option value="INGREDIENTE">Insumo</option></select></div>
          <div className="min-w-64"><label className={ui.etiqueta}>{tipo === 'PRODUCTO' ? 'Producto' : 'Insumo'}</label><select className={`${ui.input} w-full`} value={id} onChange={(e) => setId(e.target.value)}><option value="">Elige…</option>{opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></div>
          <div><label className={ui.etiqueta}>Desde</label><input type="date" className={ui.input} value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></div>
          <div><label className={ui.etiqueta}>Hasta</label><input type="date" className={ui.input} value={rango.hasta} min={rango.desde} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></div>
          <button type="button" className={ui.primario} disabled={!id} onClick={() => void consultar()}>Consultar</button>
        </>
      }>
        <p className="text-sm text-gray-400">El saldo se reconstruye desde las existencias actuales con las ventas y los movimientos registrados. Un cambio hecho por fuera de esos registros aparece como diferencia en el saldo inicial.</p>
      </Tarjeta>
      {falla && <Aviso tipo="error">{falla}</Aviso>}
      {datos && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Indicador icono={Boxes} etiqueta="Saldo inicial" valor={`${num(datos.saldoInicial)} ${unidad}`} />
            <Indicador icono={ArrowDownCircle} etiqueta="Entradas" valor={`${num(datos.entradas)} ${unidad}`} tono="verde" />
            <Indicador icono={ArrowUpCircle} etiqueta="Salidas" valor={`${num(datos.salidas)} ${unidad}`} tono="rojo" />
            <Indicador icono={Package} etiqueta="Saldo final" valor={`${num(datos.saldoFinal)} ${unidad}`} />
            <Indicador icono={DollarSign} etiqueta="Valor del saldo" valor={moneda(datos.valorSaldoFinal)} tono="naranja" />
          </div>
          <Tarjeta sinRelleno titulo={`Movimientos de ${datos.item.nombre}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead><tr><th className={ui.th}>Fecha</th><th className={ui.th}>Concepto</th><th className={ui.th}>Referencia</th><th className={ui.thNum}>Entrada</th><th className={ui.thNum}>Salida</th><th className={ui.thNum}>Saldo</th></tr></thead>
                <tbody>
                  {datos.filas.map((f: any, i: number) => (
                    <tr key={i} className={ui.fila}>
                      <td className={`${ui.td} whitespace-nowrap text-gray-400`}>{new Date(f.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className={ui.td}>{f.concepto}{f.usuario && <div className="text-xs text-gray-500">{f.usuario}</div>}</td>
                      <td className={`${ui.td} text-gray-400`}>{f.referencia}</td>
                      <td className={`${ui.tdNum} text-green-400`}>{f.entrada ? num(f.entrada, 3) : ''}</td>
                      <td className={`${ui.tdNum} text-red-400`}>{f.salida ? num(f.salida, 3) : ''}</td>
                      <td className={`${ui.tdNum} font-medium text-white`}>{num(f.saldo, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!datos.filas.length && <Vacio>Sin movimientos en el periodo.</Vacio>}
            </div>
          </Tarjeta>
        </>
      )}
      {!datos && !falla && <Vacio>Elige un producto o insumo y pulsa Consultar.</Vacio>}
    </div>
  );
}

function Compra() {
  const [dias, setDias] = useState(28);
  const [cobertura, setCobertura] = useState(7);
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const consultar = () => api.get('/costos/sugerencia-compra', { params: { dias, cobertura } }).then(({ data }) => { setDatos(data); setFalla(''); }).catch((e) => setFalla(error(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void consultar(); }, []);
  const urgentes = (datos?.items || []).filter((x: any) => x.diasCobertura !== null && x.diasCobertura < 3).length;
  return (
    <div className="space-y-6">
      {datos && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Indicador icono={ShoppingCart} etiqueta="Productos por comprar" valor={datos.items.length} />
          <Indicador icono={AlertTriangle} etiqueta="Se acaban en menos de 3 días" valor={urgentes} tono={urgentes ? 'rojo' : 'gris'} />
          <Indicador icono={DollarSign} etiqueta="Costo estimado de la compra" valor={moneda(datos.total)} tono="naranja" />
        </div>
      )}
      {falla && <Aviso tipo="error">{falla}</Aviso>}
      <Tarjeta sinRelleno titulo="Compra sugerida" acciones={
        <>
          <div><label className={ui.etiqueta}>Consumo de los últimos</label><select className={ui.input} value={dias} onChange={(e) => setDias(Number(e.target.value))}>{[7, 14, 28, 56].map((d) => <option key={d} value={d}>{d} días</option>)}</select></div>
          <div><label className={ui.etiqueta}>Comprar para (días)</label><input type="number" min={1} max={60} className={`${ui.input} w-28`} value={cobertura} onChange={(e) => setCobertura(Number(e.target.value))} /></div>
          <button type="button" className={ui.primario} onClick={() => void consultar()}>Calcular</button>
          {datos?.items.length > 0 && <button type="button" className={ui.secundario} onClick={() => exportarCsv(`compra-sugerida-${datos.fecha}.csv`, ['Tipo', 'Nombre', 'Existencia', 'Mínimo', 'Consumo diario', 'Días que alcanza', 'Comprar', 'Unidad', 'En unidad de compra', 'Costo estimado'], datos.items.map((x: any) => [x.tipo === 'PRODUCTO' ? 'Producto' : 'Insumo', x.nombre, x.stock, x.minimo, x.consumoDiario, x.diasCobertura ?? '', x.sugerido, x.unidad, x.enUnidadCompra ? `${x.enUnidadCompra} ${x.unidadCompra}` : '', x.costoEstimado]))}>Exportar para el proveedor</button>}
        </>
      }>
        <p className="border-b border-gray-800 px-4 py-3 text-xs text-gray-500">Sugerencia = consumo diario promedio × días a cubrir + mínimo − existencia. Revísala antes de pedir: no conoce promociones ni temporadas.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr><th className={ui.th}>Nombre</th><th className={ui.thNum}>Existencia</th><th className={ui.thNum}>Consumo diario</th><th className={ui.thNum}>Alcanza</th><th className={ui.thNum}>Comprar</th><th className={ui.thNum}>Costo</th></tr></thead>
            <tbody>
              {(datos?.items || []).map((x: any) => (
                <tr key={`${x.tipo}-${x.id}`} className={ui.fila}>
                  <td className={ui.td}><div className="font-medium text-white">{x.nombre}</div><div className="mt-0.5"><Chip tono="gris">{x.tipo === 'PRODUCTO' ? 'Producto' : 'Insumo'}</Chip></div></td>
                  <td className={ui.tdNum}>{num(x.stock)} {x.unidad}</td>
                  <td className={ui.tdNum}>{num(x.consumoDiario)}</td>
                  <td className={`${ui.tdNum} ${x.diasCobertura !== null && x.diasCobertura < 3 ? 'text-red-400' : ''}`}>{x.diasCobertura === null ? '—' : `${x.diasCobertura} días`}</td>
                  <td className={`${ui.tdNum} font-semibold text-white`}>{num(x.sugerido)} {x.unidad}{x.enUnidadCompra ? <div className="text-xs font-normal text-gray-500">≈ {x.enUnidadCompra} {x.unidadCompra}</div> : null}</td>
                  <td className={ui.tdNum}>{moneda(x.costoEstimado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {datos && !datos.items.length && <Vacio>Con el consumo actual no hace falta comprar nada para {datos.cobertura} días.</Vacio>}
          {!datos && !falla && <Vacio>Calculando…</Vacio>}
        </div>
      </Tarjeta>
    </div>
  );
}

function Vencimientos() {
  const [dias, setDias] = useState(7);
  const [lotes, setLotes] = useState<any[] | null>(null);
  const [rango, setRango] = useState({ desde: haceDias(30), hasta: hoy() });
  const [merma, setMerma] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const cargarLotes = () => api.get('/productos/lotes/por-vencer', { params: { dias } }).then(({ data }) => setLotes(data)).catch((e) => setFalla(error(e)));
  const cargarMerma = () => api.get('/productos/reportes/merma', { params: rango }).then(({ data }) => setMerma(data)).catch((e) => setFalla(error(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void cargarLotes(); void cargarMerma(); }, []);
  const ahora = Date.now();
  const costoMerma = (merma?.resumenPorProducto || []).reduce((s: number, p: any) => s + p.costoEstimado, 0);
  return (
    <div className="space-y-6">
      {falla && <Aviso tipo="error">{falla}</Aviso>}
      <Tarjeta sinRelleno titulo="Lotes por vencer" acciones={
        <>
          <div><label className={ui.etiqueta}>En los próximos</label><select className={ui.input} value={dias} onChange={(e) => setDias(Number(e.target.value))}>{[3, 7, 15, 30].map((d) => <option key={d} value={d}>{d} días</option>)}</select></div>
          <button type="button" className={ui.primario} onClick={() => void cargarLotes()}>Ver</button>
        </>
      }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr><th className={ui.th}>Producto</th><th className={ui.thNum}>Cantidad</th><th className={ui.thNum}>Vence</th></tr></thead>
            <tbody>
              {(lotes || []).map((l) => {
                const restan = Math.ceil((new Date(l.fechaVencimiento).getTime() - ahora) / 86400000);
                return (
                  <tr key={l.id} className={ui.fila}>
                    <td className={ui.td}><div className="font-medium text-white">{l.producto?.nombre}</div><div className="text-xs text-gray-500">{l.producto?.categoria?.nombre}</div></td>
                    <td className={ui.tdNum}>{l.cantidadRestante} und</td>
                    <td className={`${ui.tdNum} ${restan < 0 ? 'text-red-400' : restan <= 2 ? 'text-yellow-400' : ''}`}>{restan < 0 ? `Vencido hace ${-restan} días` : restan === 0 ? 'Hoy' : `En ${restan} días`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lotes && !lotes.length && <Vacio>No hay lotes por vencer en ese plazo.</Vacio>}
        </div>
      </Tarjeta>
      <Tarjeta sinRelleno titulo="Mermas" acciones={
        <>
          <div><label className={ui.etiqueta}>Desde</label><input type="date" className={ui.input} value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></div>
          <div><label className={ui.etiqueta}>Hasta</label><input type="date" className={ui.input} value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></div>
          <button type="button" className={ui.primario} onClick={() => void cargarMerma()}>Ver</button>
        </>
      }>
        <p className="border-b border-gray-800 px-4 py-3 text-xs text-gray-500">Las mermas se registran en Productos, al dar salida de existencias con un motivo (dañado, donado, consumo propio u otro).{merma?.resumenPorProducto.length ? ` Costo estimado del periodo: ${moneda(costoMerma)}.` : ''}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead><tr><th className={ui.th}>Producto</th><th className={ui.thNum}>Cantidad</th><th className={ui.th}>Motivos</th><th className={ui.thNum}>Costo</th></tr></thead>
            <tbody>
              {(merma?.resumenPorProducto || []).map((p: any) => (
                <tr key={p.productoId} className={ui.fila}>
                  <td className={`${ui.td} font-medium text-white`}>{p.nombre}</td>
                  <td className={ui.tdNum}>{num(p.cantidad)}</td>
                  <td className={`${ui.td} text-xs text-gray-400`}>{Object.entries(p.motivos).map(([m, c]) => `${m.toLowerCase().replace('_', ' ')}: ${c}`).join(' · ')}</td>
                  <td className={ui.tdNum}>{moneda(p.costoEstimado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {merma && !merma.resumenPorProducto.length && <Vacio>Sin mermas en el periodo.</Vacio>}
        </div>
      </Tarjeta>
    </div>
  );
}
