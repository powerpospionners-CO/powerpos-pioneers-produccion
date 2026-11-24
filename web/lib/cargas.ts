type EstadoCarga = { activas: number; fallos: number };
const inicial: EstadoCarga = { activas: 0, fallos: 0 };
let estado = inicial;
let siguiente = 0;
const pendientes = new Set<number>();
const oyentes = new Set<() => void>();
export const estadoCargas = () => estado;
export const estadoCargasServidor = () => inicial;
export function observarCargas(fn: () => void) {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}
function publicar(fallo = false) {
  estado = { activas: pendientes.size, fallos: estado.fallos + Number(fallo) };
  oyentes.forEach((fn) => fn());
}
export function iniciarCarga() {
  const id = ++siguiente;
  pendientes.add(id);
  publicar();
  return id;
}
export function terminarCarga(id?: number, fallo = false) {
  if (id !== undefined && pendientes.delete(id)) publicar(fallo);
}
export function contieneArchivo(data: unknown) {
  return (
    typeof FormData !== "undefined" &&
    data instanceof FormData &&
    [...data.values()].some(
      (v) => typeof Blob !== "undefined" && v instanceof Blob,
    )
  );
}
