export type ProductoPublico = {
  id: number;
  nombre: string;
  descripcion: string;
  precio: string;
  imagen: string;
  disponible: boolean;
  categoria: { nombre: string };
  origen?: string;
  presentacion?: string;
};
export type TiendaPublica = {
  nombre: string;
  logo: string;
  telefono: string;
  direccion: string;
  config: {
    titulo: string;
    descripcion: string;
    sobreNosotros: string;
    color: string;
    coloresAutomaticos?: boolean;
    paletaLogo?: { principal: string; secundario: string };
    portada: string;
    whatsapp: string;
    horario: string;
    instagram: string;
    facebook: string;
    tiktok: string;
    pedidosHabilitados: boolean;
    minimo: number;
    zonas: { nombre: string; costo: number }[];
    antetitulo?: string;
    portadaEtiqueta?: string;
    portadaTexto?: string;
  };
  productos: ProductoPublico[];
};
const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
export async function solicitarTienda<T>(
  ruta: string,
  options?: RequestInit,
): Promise<T> {
  const r = await fetch(base + ruta, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(", ")
        : data.message || "No se pudo completar la solicitud",
    );
  return data as T;
}
