import { BadRequestException } from '@nestjs/common';
import { esBebida, adicionalListo } from '../adicionales/reglas-trailer';
import { texto } from './reglas';
import { fechaIso, revisarHorario } from './tienda-extras.reglas';
import type { HorarioDia } from './horarios';

const fallo = (m: string): never => {
  throw new BadRequestException(m);
};

export type OpcionAdicional = { id: number; nombre: string; precio: number };

// Mismas reglas que la caja (PedidosService): así el precio web coincide al aceptar el pedido.
// Los empaques para llevar no se ofrecen: la web no envía tipo de consumo y la caja no los agrega.
export function adicionalesDeProducto(
  producto: any,
  globales: any[],
  empresaId: number,
  restaurante: boolean,
): OpcionAdicional[] {
  if (!restaurante) return [];
  const forma = (a: any) => ({ id: a.id, nombre: a.nombre, precio: Number(a.precio) });
  const normales = (lista: any[]) => lista.filter((a) => !a.empaqueParaLlevar);
  if (empresaId === 1)
    return esBebida(producto) ? [] : normales(globales).filter(adicionalListo).map(forma);
  const propios = (producto.adicionales || []).map((pa: any) => pa.adicional);
  if (propios.length)
    return normales(propios).filter((a: any) => a.activo && a.disponible).map(forma);
  return producto.aceptaAdicionales ? normales(globales).map(forma) : [];
}

export type LineaSolicitada = {
  productoId: number;
  cantidad: number;
  presentacionId: number | null;
  adicionales: { adicionalId: number; cantidad: number }[];
  observacion: string;
};

export function validarLineas(items: unknown): LineaSolicitada[] {
  if (!Array.isArray(items) || !items.length || items.length > 50) fallo('Carrito inválido');
  const lineas = (items as any[]).map((i) => {
    if (
      !i || !Number.isSafeInteger(i.productoId) || i.productoId < 1 ||
      !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > 99
    )
      fallo('Carrito inválido');
    const presentacionId = i.presentacionId == null ? null : Number(i.presentacionId);
    if (presentacionId !== null && (!Number.isSafeInteger(presentacionId) || presentacionId < 1)) fallo('Presentación inválida');
    const adicionales = i.adicionales == null ? [] : i.adicionales;
    if (!Array.isArray(adicionales) || adicionales.length > 20) fallo('Adicionales inválidos');
    const vistos = new Set<number>();
    for (const a of adicionales) {
      if (!a || !Number.isSafeInteger(a.adicionalId) || a.adicionalId < 1 || !Number.isInteger(a.cantidad) || a.cantidad < 1 || a.cantidad > 10 || vistos.has(a.adicionalId))
        fallo('Adicionales inválidos');
      vistos.add(a.adicionalId);
    }
    return {
      productoId: i.productoId,
      cantidad: i.cantidad,
      presentacionId,
      adicionales: adicionales.map((a: any) => ({ adicionalId: a.adicionalId, cantidad: a.cantidad })),
      observacion: texto(i.observacion ?? '', 'Nota del producto', 140),
    };
  });
  // La misma combinación de producto y opciones va en una sola línea.
  const claves = lineas.map((l) => JSON.stringify([l.productoId, l.presentacionId, [...l.adicionales].sort((a, b) => a.adicionalId - b.adicionalId), l.observacion]));
  if (new Set(claves).size !== claves.length) fallo('Carrito inválido');
  return lineas;
}

type Programado = { fecha: string; hora: string } | null;
export type Entrega =
  | { tipo: 'DOMICILIO'; programado: Programado }
  | { tipo: 'RECOGER'; programado: Programado }
  | { tipo: 'MESA'; mesa: number; programado: null };

export function validarEntrega(
  body: any,
  t: { recogerHabilitado: boolean; programarHabilitado: boolean; mesasHabilitadas: boolean; mesasCantidad: number; horarios: HorarioDia[] | null },
  ahora: { fecha: string; minutos: number },
  mesaValida: (numero: number, token: unknown) => boolean,
): Entrega {
  const tipo = body?.entrega ?? 'DOMICILIO';
  if (tipo === 'MESA') {
    const mesa = Number(body.mesa?.numero);
    if (!t.mesasHabilitadas || !Number.isSafeInteger(mesa) || mesa < 1 || mesa > t.mesasCantidad || !mesaValida(mesa, body.mesa?.token))
      fallo('El código QR de la mesa no es válido. Pide ayuda al personal.');
    return { tipo: 'MESA', mesa, programado: null };
  }
  if (tipo !== 'DOMICILIO' && tipo !== 'RECOGER') fallo('Tipo de entrega inválido');
  if (tipo === 'RECOGER' && !t.recogerHabilitado) fallo('Esta tienda no ofrece recoger en el local');
  if (body.programadoPara == null || body.programadoPara === '') return { tipo, programado: null } as Entrega;
  if (!t.programarHabilitado) fallo('Esta tienda no recibe pedidos programados');
  const [f, h] = String(body.programadoPara).split('T');
  const fecha = fechaIso(f, 'Fecha programada');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h || '')) fallo('Hora programada inválida');
  const minutos = Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
  const anticipacion = (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${ahora.fecha}T00:00:00Z`)) / 60000 + minutos - ahora.minutos;
  if (anticipacion < 45) fallo('Programa el pedido con al menos 45 minutos de anticipación');
  if (anticipacion > 7 * 24 * 60) fallo('Solo se programan pedidos hasta 7 días adelante');
  if (t.horarios) revisarHorario(t.horarios, fecha, h);
  return { tipo, programado: { fecha, hora: h } } as Entrega;
}

export function validarFuncionesExperiencia(t: any) {
  for (const campo of ['avisosClientes', 'recogerHabilitado', 'programarHabilitado', 'mesasHabilitadas', 'resenasHabilitadas'])
    if (typeof t[campo] !== 'boolean') fallo('Estado de funciones de la tienda inválido');
  if (!Number.isSafeInteger(t.mesasCantidad) || t.mesasCantidad < 1 || t.mesasCantidad > 200)
    fallo('Número de mesas inválido (1 a 200)');
  return {
    avisosClientes: t.avisosClientes as boolean,
    recogerHabilitado: t.recogerHabilitado as boolean,
    programarHabilitado: t.programarHabilitado as boolean,
    mesasHabilitadas: t.mesasHabilitadas as boolean,
    mesasCantidad: t.mesasCantidad as number,
    resenasHabilitadas: t.resenasHabilitadas as boolean,
  };
}

export function validarResena(body: any) {
  if (!Number.isSafeInteger(body?.productoId) || body.productoId < 1) fallo('Producto inválido');
  if (!Number.isInteger(body?.estrellas) || body.estrellas < 1 || body.estrellas > 5) fallo('Califica de 1 a 5 estrellas');
  return { productoId: body.productoId as number, estrellas: body.estrellas as number, texto: texto(body.texto ?? '', 'Comentario', 600) };
}
