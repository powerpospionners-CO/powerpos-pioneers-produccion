export type SeleccionTexto = { inicio: number; fin: number };

export function editarConTeclado(valor: string, seleccion: SeleccionTexto, tecla: string) {
  const inicio = Math.min(valor.length, Math.max(0, seleccion.inicio));
  const fin = Math.min(valor.length, Math.max(inicio, seleccion.fin));
  if (tecla === 'LIMPIAR') return { valor: '', cursor: 0 };
  if (tecla === 'BORRAR') {
    const desde = inicio === fin ? Math.max(0, inicio - 1) : inicio;
    return { valor: valor.slice(0, desde) + valor.slice(fin), cursor: desde };
  }
  return { valor: valor.slice(0, inicio) + tecla + valor.slice(fin), cursor: inicio + tecla.length };
}

export function empresaConTeclado(empresaId?: number | null) {
  return empresaId === 1; // Trailer del Sabor: identificador central, estable entre sus bases de sede.
}
