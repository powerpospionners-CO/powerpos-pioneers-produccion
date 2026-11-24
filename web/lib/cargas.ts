type EstadoCarga = { activas: number; fallos: number; guardados: number };
const inicial: EstadoCarga = { activas: 0, fallos: 0, guardados: 0 };
let estado = inicial;
let siguiente = 0;
const pendientes = new Map<
  number,
  {
    inicio: number;
    minimo: number;
    terminando: boolean;
    tipo: "archivo" | "guardado";
  }
>();
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
  estado = {
    activas: pendientes.size,
    fallos: estado.fallos + Number(fallo),
    guardados: [...pendientes.values()].filter((c) => c.tipo === "guardado")
      .length,
  };
  oyentes.forEach((fn) => fn());
}
export function iniciarCarga(
  minimo = 700,
  tipo: "archivo" | "guardado" = "archivo",
) {
  const id = ++siguiente;
  pendientes.set(id, { inicio: Date.now(), minimo, terminando: false, tipo });
  publicar();
  return id;
}
export function terminarCarga(id?: number, fallo = false) {
  if (id === undefined) return;
  const carga = pendientes.get(id);
  if (!carga || carga.terminando) return;
  carga.terminando = true;
  const cerrar = () => {
    if (pendientes.delete(id)) publicar(fallo);
  };
  const restante = carga.minimo - (Date.now() - carga.inicio);
  if (restante > 0) setTimeout(cerrar, restante);
  else cerrar();
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

export const iniciarGuardado = () => iniciarCarga(700, "guardado");
export async function conGuardado<T>(tarea: () => Promise<T>) {
  const id = iniciarGuardado();
  try {
    return await tarea();
  } finally {
    terminarCarga(id);
  }
}
