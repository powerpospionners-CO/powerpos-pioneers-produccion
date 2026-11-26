import { csvSeguro } from './csvSeguro';

// CSV para Excel en español: separador ";" y BOM. Los números van tal cual; los textos se neutralizan.
export function filasCsv(encabezados: string[], filas: unknown[][]) {
  const celda = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : csvSeguro(v));
  return '\uFEFF' + [encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
}

export function exportarCsv(nombre: string, encabezados: string[], filas: unknown[][]) {
  const url = URL.createObjectURL(new Blob([filasCsv(encabezados, filas)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
