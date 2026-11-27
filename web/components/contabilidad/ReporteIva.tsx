'use client';

import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';
import api from '@/lib/api';
import { moneda } from '@/lib/formato';
import { exportarCsv } from '@/lib/csv';
import { Aviso, Indicador, Tarjeta, Vacio, ui } from '@/components/ui/Panel';

// Bimestres de la declaración de IVA (ene-feb, mar-abr, ...), en fechas de Bogotá.
function bimestres() {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [y, m] = hoy.split('-').map(Number);
  const lista: { etiqueta: string; desde: string; hasta: string }[] = [];
  let anio = y, inicio = m % 2 === 0 ? m - 1 : m;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  for (let i = 0; i < 6; i++) {
    const fin = new Date(Date.UTC(anio, inicio + 1, 0)).getUTCDate();
    lista.push({ etiqueta: `${MESES[inicio - 1]} – ${MESES[inicio]} ${anio}`, desde: `${anio}-${String(inicio).padStart(2, '0')}-01`, hasta: `${anio}-${String(inicio + 1).padStart(2, '0')}-${fin}` });
    inicio -= 2;
    if (inicio < 1) { inicio += 12; anio--; }
  }
  return lista;
}

export default function ReporteIva() {
  const opciones = bimestres();
  const [periodo, setPeriodo] = useState(opciones[0]);
  const [datos, setDatos] = useState<any>(null);
  const [falla, setFalla] = useState('');
  const [cargando, setCargando] = useState(false);
  const consultar = () => {
    setCargando(true);
    api.get('/iva/reporte', { params: { desde: periodo.desde, hasta: periodo.hasta } })
      .then(({ data }) => { setDatos(data); setFalla(''); })
      .catch((e) => setFalla(e?.response?.data?.message || 'No se pudo consultar'))
      .finally(() => setCargando(false));
  };
  const exportar = () => exportarCsv(`iva-${periodo.desde}-${periodo.hasta}.csv`, ['Tarifa', 'Base ventas', 'IVA ventas', 'Base devoluciones', 'IVA devoluciones', 'Base neta', 'IVA generado', 'Base compras', 'IVA descontable'], datos.tarifas.map((t: any) => [t.nombre, t.ventas.base, t.ventas.iva, t.devoluciones.base, t.devoluciones.iva, t.neto.base, t.neto.iva, t.compras.base, t.compras.iva]));
  return (
    <div className="space-y-6">
      <Tarjeta titulo="Periodo" acciones={
        <>
          <div>
            <label className={ui.etiqueta}>Bimestre</label>
            <select className={ui.input} value={periodo.desde} onChange={(e) => setPeriodo(opciones.find((o) => o.desde === e.target.value)!)}>{opciones.map((o) => <option key={o.desde} value={o.desde}>{o.etiqueta}</option>)}</select>
          </div>
          <button type="button" disabled={cargando} onClick={consultar} className={ui.primario}>{cargando ? 'Consultando…' : 'Consultar'}</button>
          {datos?.responsable && <button type="button" className={ui.secundario} onClick={exportar}>Exportar CSV</button>}
        </>
      }>
        <p className="text-sm text-gray-400">Estimación del IVA del bimestre con las tarifas configuradas. Tu contador presenta la declaración (formulario 300) con sus propios soportes.</p>
      </Tarjeta>

      {falla && <Aviso tipo="error">{falla}</Aviso>}
      {datos && !datos.responsable && <Aviso>La empresa no está marcada como responsable de IVA.</Aviso>}
      {datos?.responsable && (
        <>
          {datos.sinConfirmar > 0 && <Aviso tipo="alerta">Hay {datos.sinConfirmar} productos sin tarifa confirmada. Revisa la pestaña Tarifas de IVA antes de declarar.</Aviso>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Indicador icono={ArrowUpCircle} etiqueta="IVA generado (ventas − devoluciones)" valor={moneda(datos.ivaGenerado)} tono="naranja" />
            <Indicador icono={ArrowDownCircle} etiqueta="IVA descontable (compras)" valor={moneda(datos.ivaDescontable)} tono="verde" />
            <Indicador icono={Scale} etiqueta={datos.saldo >= 0 ? 'Saldo a pagar estimado' : 'Saldo a favor estimado'} valor={moneda(Math.abs(datos.saldo))} tono={datos.saldo >= 0 ? 'amarillo' : 'verde'} />
          </div>
          <Tarjeta titulo="Detalle por tarifa" sinRelleno>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead><tr><th className={ui.th}>Tarifa</th><th className={ui.thNum}>Base neta</th><th className={ui.thNum}>IVA generado</th><th className={ui.thNum}>Base compras</th><th className={ui.thNum}>IVA descontable</th></tr></thead>
                <tbody>
                  {datos.tarifas.map((t: any) => (
                    <tr key={t.tarifa} className={ui.fila}>
                      <td className={`${ui.td} font-medium text-white`}>{t.nombre}</td>
                      <td className={ui.tdNum}>{moneda(t.neto.base)}</td><td className={ui.tdNum}>{moneda(t.neto.iva)}</td>
                      <td className={ui.tdNum}>{moneda(t.compras.base)}</td><td className={ui.tdNum}>{moneda(t.compras.iva)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>
        </>
      )}
      {!datos && !falla && <Vacio>Elige el bimestre y pulsa Consultar.</Vacio>}
    </div>
  );
}
