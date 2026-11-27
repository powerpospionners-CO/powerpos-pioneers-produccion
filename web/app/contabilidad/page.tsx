'use client';

import { useState } from 'react';
import { CheckCircle2, CircleAlert, FileText, Scale } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { exportarCsv } from '@/lib/csv';
import TarifasIva from '@/components/contabilidad/TarifasIva';
import ReporteIva from '@/components/contabilidad/ReporteIva';
import { Aviso, Indicador, Pagina, Pestanas, Tarjeta, Vacio, ui } from '@/components/ui/Panel';

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const inicioMes = () => `${hoy().slice(0, 8)}01`;
const PESTANAS = [['libro', 'Libro diario'], ['iva', 'Reporte de IVA'], ['tarifas', 'Tarifas de IVA']] as const;

export default function ContabilidadPage() {
  const [pestana, setPestana] = useState<'libro' | 'iva' | 'tarifas'>('libro');
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col text-white">
        <Navbar />
        <Pagina titulo="Contabilidad" descripcion="Libro diario con cuentas del PUC, IVA por bimestre y tarifas por producto, listos para tu contador.">
          <Pestanas opciones={PESTANAS} valor={pestana} onCambio={setPestana} />
          {pestana === 'libro' && <LibroDiario />}
          {pestana === 'iva' && <ReporteIva />}
          {pestana === 'tarifas' && <TarifasIva />}
        </Pagina>
      </div>
    </AuthGuard>
  );
}

function LibroDiario() {
  const [rango, setRango] = useState({ desde: inicioMes(), hasta: hoy() });
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const [cargando, setCargando] = useState(false);
  const generar = async () => {
    setCargando(true); setFalla('');
    try {
      setDatos((await api.get('/contabilidad/libro-diario', { params: rango })).data);
    } catch (e: any) {
      setFalla(e?.response?.data?.message || 'No se pudo generar el libro diario');
    } finally { setCargando(false); }
  };
  const exportar = () => exportarCsv(
    `libro-diario-${rango.desde}-a-${rango.hasta}.csv`,
    ['Comprobante', 'Fecha', 'Tipo', 'Cuenta', 'Nombre de la cuenta', 'Detalle', 'Débito', 'Crédito', 'NIT empresa', 'Por verificar'],
    datos.comprobantes.flatMap((c: any) => c.lineas.map((l: any) => [c.numero, c.fecha, c.tipo, l.cuenta, l.nombre, l.detalle, l.debito, l.credito, datos.empresa?.nit || '', c.verificar || ''])),
  );
  return (
    <div className="space-y-6">
      <Tarjeta titulo="Periodo" acciones={
        <>
          <div><label className={ui.etiqueta}>Desde</label><input type="date" className={ui.input} value={rango.desde} max={rango.hasta} onChange={(e) => setRango({ ...rango, desde: e.target.value })} /></div>
          <div><label className={ui.etiqueta}>Hasta</label><input type="date" className={ui.input} value={rango.hasta} min={rango.desde} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} /></div>
          <button type="button" disabled={cargando} onClick={() => void generar()} className={ui.primario}>{cargando ? 'Generando…' : 'Generar'}</button>
          {datos?.comprobantes.length > 0 && <button type="button" onClick={exportar} className={ui.secundario}>Exportar para el contador</button>}
        </>
      }>
        <p className="text-sm text-gray-400">
          Asientos de partida doble por día a partir de lo registrado en esta sede. Tu contador los importa en Siigo, World Office u otro programa.
          {datos?.iva?.responsable && ' Las ventas separan la base y el IVA generado (240805) y las compras de mercancía el IVA descontable (240810).'}
        </p>
      </Tarjeta>

      {falla && <Aviso tipo="error">{falla}</Aviso>}
      {datos && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Indicador icono={FileText} etiqueta="Comprobantes" valor={datos.comprobantes.length} />
            <Indicador icono={Scale} etiqueta="Total débitos" valor={moneda(datos.totales.debitos)} />
            <Indicador icono={Scale} etiqueta="Total créditos" valor={moneda(datos.totales.creditos)} />
            <Indicador icono={CircleAlert} etiqueta="Por verificar" valor={datos.porVerificar} tono={datos.porVerificar ? 'amarillo' : 'gris'} />
          </div>
          {datos.descuadrados.length > 0
            ? <Aviso tipo="error">No cuadran: {datos.descuadrados.join(', ')}. Avísale a soporte.</Aviso>
            : datos.comprobantes.length > 0 && <Aviso tipo="exito"><span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> Todos los comprobantes cuadran: débitos = créditos.</span></Aviso>}
          {!datos.comprobantes.length && <Tarjeta><Vacio>Sin movimientos en el periodo.</Vacio></Tarjeta>}
          <div className="space-y-4">
            {datos.comprobantes.map((c: any) => (
              <Tarjeta key={c.numero} sinRelleno titulo={
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="rounded-md bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-300">{c.numero}</span>
                  <h3 className="font-semibold text-white">{c.tipo}</h3>
                  <span className="text-sm text-gray-500">{c.fecha} · {c.descripcion}</span>
                </div>
              }>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px]">
                    <thead><tr><th className={`${ui.th} w-28`}>Cuenta</th><th className={ui.th}>Nombre</th><th className={`${ui.thNum} w-40`}>Débito</th><th className={`${ui.thNum} w-40`}>Crédito</th></tr></thead>
                    <tbody>
                      {c.lineas.map((l: any, i: number) => (
                        <tr key={i} className={ui.fila}>
                          <td className={`${ui.td} font-mono text-xs text-gray-400`}>{l.cuenta}</td>
                          <td className={ui.td}>{l.nombre}</td>
                          <td className={ui.tdNum}>{l.debito ? moneda(l.debito) : ''}</td>
                          <td className={ui.tdNum}>{l.credito ? moneda(l.credito) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {c.verificar && <p className="border-t border-gray-800 px-4 py-3 text-xs text-yellow-300">Verificar: {c.verificar}</p>}
              </Tarjeta>
            ))}
          </div>
        </>
      )}
      {!datos && !falla && <Vacio>Elige el periodo y pulsa Generar.</Vacio>}
    </div>
  );
}
