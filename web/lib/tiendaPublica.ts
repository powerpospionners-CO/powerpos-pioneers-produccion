export type ProductoPublico = {
  id: number;
  nombre: string;
  descripcion: string;
  precio: string;
  imagen: string;
  disponible: boolean;
  stockActual: number;
  ventaGranel?: boolean;
  unidadGranel?: string | null;
  categoria: { nombre: string };
  categoriaId?: number;
  origen?: string;
  presentacion?: string;
};
export type TiendaPublica = {
  bold?: { habilitado: boolean };
  nombre: string;
  logo: string;
  telefono: string;
  direccion: string;
  legal?: { razonSocial: string; nit: string; correo: string };
  config: {
    titulo: string;
    descripcion: string;
    sobreNosotros: string;
    destacadosIds?: number[];
    novedadesIds?: number[];
    promociones?: {
      titulo: string;
      detalle: string;
      desde: string;
      hasta: string;
      productoId: number | null;
    }[];
    testimonios?: { nombre: string; texto: string; autorizado: boolean }[];
    politicas?: {
      envios: string;
      cambios: string;
      devoluciones: string;
      privacidad: string;
      terminos?: string;
    };
    razonSocial?: string;
    mostrarNit?: boolean;
    correoPublico?: string;
    googleAnalyticsId?: string;
    metaPixelId?: string;
    reservasHabilitadas?: boolean;
    reservaMaxPersonas?: number;
    reservaDiasMax?: number;
    boletinHabilitado?: boolean;
    cuentasHabilitadas?: boolean;
    fichasProductos?: { productoId: number; imagenes: string[] }[];
    mision?: string;
    vision?: string;
    galeria?: { imagen: string; descripcion: string }[];
    preguntasFrecuentes?: { pregunta: string; respuesta: string }[];
    imagenesCategorias?: { categoriaId: number; imagen: string }[];
    color: string;
    coloresAutomaticos?: boolean;
    paletaLogo?: { principal: string; secundario: string };
    portada: string;
    whatsapp: string;
    horario: string;
    horarios?:
      | { dia: number; abierto: boolean; apertura: string; cierre: string }[]
      | null;
    ciudadesEntrega?: string[];
    pagos?: string;
    envios?: string;
    instagram: string;
    facebook: string;
    tiktok: string;
    pedidosHabilitados: boolean;
    minimo: number;
    zonas: { id?: string; ciudad?: string; nombre: string; costo: number }[];
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
