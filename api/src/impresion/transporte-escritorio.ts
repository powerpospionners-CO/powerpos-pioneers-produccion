import { AsyncLocalStorage } from 'node:async_hooks';
type Trabajo = { tipo: string; datosBase64: string };
const contexto = new AsyncLocalStorage<Trabajo[]>();
export function impresionEnEscritorio() {
  return contexto.getStore() !== undefined;
}
export function prepararEnEscritorio(tipo: string, datos: Buffer) {
  const trabajos = contexto.getStore();
  if (!trabajos) return false;
  trabajos.push({ tipo, datosBase64: datos.toString('base64') });
  return true;
}
// Solo se utiliza dentro de controladores autenticados. Preparar no afirma haber impreso.
export async function ejecutarImpresionEscritorio(
  habilitado: boolean,
  tarea: () => Promise<any>,
) {
  if (!habilitado) return tarea();
  return contexto.run([], async () => {
    const resultado = await tarea();
    return {
      ...resultado,
      impreso: false,
      abierto: false,
      modo: 'escritorio',
      preparado: !!contexto.getStore()!.length,
      trabajos: contexto.getStore(),
    };
  });
}
