import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { WhatsappService } from '../notificaciones/whatsapp.service';
import { puntosConfig, tiendaConfig } from './reglas';
import { ahoraColombia, normalizarCorreo } from './tienda-extras.reglas';
import { validarResena } from './tienda-opciones.reglas';
import { ClienteWeb, TiendaExtrasService } from './tienda-extras.service';
import { firmaMesa, Registro, TiendaRegistros } from './tienda-registros';

type Usuario = { id: number; empresaId: number; rol: string };
type Destino = { telefono?: string; whatsapp?: boolean; correo?: string };
const ESTADOS_PEDIDO: Record<string, [string, string]> = {
  ACEPTADO: ['Tu pedido fue aceptado', 'Ya estamos preparando tu pedido.'],
  EN_CAMINO: ['Tu pedido va en camino', 'El domiciliario ya salió con tu pedido.'],
  ENTREGADO: ['Pedido entregado', '¡Gracias por tu compra! Esperamos que lo disfrutes.'],
  RECHAZADO: ['No pudimos aceptar tu pedido', 'La tienda canceló tu solicitud.'],
};
const ESTADOS_RESERVA: Record<string, [string, string]> = {
  CONFIRMADA: ['Tu reserva está confirmada', 'Te esperamos.'],
  RECHAZADA: ['No pudimos confirmar tu reserva', 'La tienda no pudo aceptar la reserva.'],
  CANCELADA: ['Tu reserva fue cancelada', 'La tienda canceló la reserva.'],
};
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class TiendaExperienciaService {
  private readonly logger = new Logger(TiendaExperienciaService.name);
  private recordando = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly registros: TiendaRegistros,
    private readonly extras: TiendaExtrasService,
    @Optional() private readonly notificaciones?: NotificacionesService,
    @Optional() private readonly whatsapp?: WhatsappService,
  ) {}

  // ---------- Avisos al cliente ----------
  canalesDisponibles() {
    return { whatsapp: !!this.whatsapp?.clienteConfigurado(), correo: !!process.env.SMTP_USER && !!process.env.SMTP_PASS };
  }
  // Nunca bloquea la operación: un aviso fallido solo se registra en el log.
  async avisar(empresa: string, destino: Destino, titulo: string, mensaje: string) {
    const envios: Promise<unknown>[] = [];
    if (destino.correo && this.notificaciones)
      envios.push(this.notificaciones.enviarAvisoCliente(destino.correo, empresa, titulo, mensaje));
    if (destino.whatsapp && destino.telefono && this.whatsapp)
      envios.push(this.whatsapp.enviarCliente(destino.telefono, empresa, `${titulo}. ${mensaje}`));
    await Promise.allSettled(envios);
  }
  async registrarAvisoPedido(empresaId: number, pedidoWebId: string, destino: Destino, tx: any) {
    await this.registros.crear(empresaId, 'AVISO_PEDIDO', pedidoWebId, destino, { referenciaId: pedidoWebId }, tx);
  }
  // Se consulta fuera de la transacción de la venta: si la tabla no existe no la invalida.
  async datosPedido(empresaId: number, pedidoWebId: string) {
    const [uso, canje, enlace] = await Promise.all([
      this.registros.buscar(empresaId, 'CUPON_USO', pedidoWebId),
      this.registros.buscar(empresaId, 'CANJE_PEDIDO', pedidoWebId),
      this.registros.buscar(empresaId, 'PEDIDO_CLIENTE', pedidoWebId),
    ]);
    let clientePosId: number | null = null;
    if (enlace?.referenciaId) {
      const c = await this.registros.obtener(empresaId, 'CLIENTE', enlace.referenciaId);
      if (c) clientePosId = this.registros.abrir<ClienteWeb>(c).clientePosId ?? null;
    }
    return {
      cupon: uso?.estado === 'APLICADO' ? (uso.datos as { codigo: string; descuento: number }) : null,
      canje: canje ? (canje.datos as { puntos: number; valor: number; clientePosId: number }) : null,
      clientePosId,
    };
  }
  async avisarPedido(empresaId: number, pedido: { id: string; telefono: string; estado: string; motivo?: string | null }) {
    const estado = ESTADOS_PEDIDO[pedido.estado];
    if (!estado) return;
    try {
      const e = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true, tiendaConfig: true } });
      if (!e || !tiendaConfig(e.tiendaConfig).avisosClientes) return;
      const r = await this.registros.buscar(empresaId, 'AVISO_PEDIDO', pedido.id);
      if (!r) return;
      const d = this.registros.abrir<Destino>(r);
      const mensaje = `${estado[1]} Pedido #${pedido.id.slice(0, 8)}.${pedido.motivo ? ` Motivo: ${pedido.motivo}` : ''}`;
      await this.avisar(e.nombre, { ...d, telefono: pedido.telefono }, estado[0], mensaje);
    } catch (err) {
      this.logger.warn(`No se pudo avisar el estado de un pedido web: ${err}`);
    }
  }
  async avisarReserva(empresaId: number, id: string) {
    try {
      const e = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { nombre: true, tiendaConfig: true } });
      const r = await this.registros.obtener(empresaId, 'RESERVA', id);
      if (!e || !r || !tiendaConfig(e.tiendaConfig).avisosClientes) return;
      const estado = ESTADOS_RESERVA[r.estado];
      if (!estado) return;
      const d = this.registros.abrir<any>(r);
      await this.avisar(
        e.nombre,
        { telefono: d.telefono, whatsapp: d.avisos === true, correo: d.correo || undefined },
        estado[0],
        `${estado[1]} ${d.fecha} a las ${d.hora}, ${d.personas} ${d.personas === 1 ? 'persona' : 'personas'}.${d.motivo ? ` Motivo: ${d.motivo}` : ''}`,
      );
    } catch (err) {
      this.logger.warn(`No se pudo avisar el estado de una reserva: ${err}`);
    }
  }

  // Recordatorio el día anterior, entre 9:00 y 19:00 de Colombia, una sola vez por reserva.
  @Cron('0 15 9-19 * * *', { timeZone: 'America/Bogota' })
  async recordarReservas() {
    if (this.recordando || (!this.canalesDisponibles().correo && !this.canalesDisponibles().whatsapp)) return;
    this.recordando = true;
    try {
      await this.prisma.enCadaSede(() => this.recordarReservasSede(), 'RECORDATORIO_RESERVAS');
    } catch (e) {
      this.logger.warn(`Recordatorios de reservas no completados: ${e}`);
    } finally {
      this.recordando = false;
    }
  }
  async recordarReservasSede(ahora = new Date()) {
    const manana = new Date(`${ahoraColombia(ahora).fecha}T12:00:00Z`);
    manana.setUTCDate(manana.getUTCDate() + 1);
    const fecha = manana.toISOString().slice(0, 10);
    let filas: Registro[] = [];
    try {
      filas = await this.prisma.tiendaRegistro.findMany({ where: { tipo: 'RESERVA', estado: 'CONFIRMADA' }, take: 2000 });
    } catch (e) {
      if (e?.code === 'P2021') return 0;
      throw e;
    }
    const nombres = new Map<number, { nombre: string; activo: boolean }>();
    let enviados = 0;
    for (const r of filas) {
      const d = this.registros.abrir<any>(r);
      if (d.fecha !== fecha || d.recordado) continue;
      if (!nombres.has(r.empresaId)) {
        const e = await this.prisma.empresa.findUnique({ where: { id: r.empresaId }, select: { nombre: true, tiendaConfig: true } });
        nombres.set(r.empresaId, { nombre: e?.nombre || '', activo: !!e && tiendaConfig(e.tiendaConfig).avisosClientes });
      }
      const e = nombres.get(r.empresaId)!;
      if (!e.activo || (!d.correo && !d.avisos)) continue;
      // Se marca antes de enviar: un fallo de envío no repite mensajes cada hora.
      try {
        await this.registros.actualizar(r, { datos: { ...d, recordado: true } });
      } catch {
        continue;
      }
      await this.avisar(e.nombre, { telefono: d.telefono, whatsapp: d.avisos === true, correo: d.correo || undefined }, 'Recordatorio de tu reserva', `Te esperamos mañana ${d.fecha} a las ${d.hora}, ${d.personas} ${d.personas === 1 ? 'persona' : 'personas'}. Si no puedes asistir, avísanos.`);
      enviados++;
    }
    return enviados;
  }

  // ---------- Mesas con QR ----------
  async mesas(user: Usuario) {
    const e = await this.prisma.empresa.findUnique({ where: { id: user.empresaId }, select: { tiendaSlug: true, tiendaConfig: true } });
    const t = tiendaConfig(e?.tiendaConfig);
    if (!e || !t.mesasHabilitadas) return { slug: e?.tiendaSlug || '', mesas: [] };
    return {
      slug: e.tiendaSlug,
      mesas: Array.from({ length: t.mesasCantidad }, (_, i) => ({ numero: i + 1, token: firmaMesa(user.empresaId, i + 1) })),
    };
  }

  // ---------- Puntos de fidelización ----------
  // El cajero entrega un código de un solo uso al cliente presente; así nadie vincula puntos ajenos.
  async codigoVinculo(user: Usuario, clientePosId: number) {
    if (!Number.isSafeInteger(clientePosId)) throw new BadRequestException('Cliente inválido');
    const c = await this.prisma.cliente.findFirst({ where: { id: clientePosId, empresaId: user.empresaId, activo: true }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    const e = await this.prisma.empresa.findUnique({ where: { id: user.empresaId }, select: { tiendaConfig: true } });
    if (!tiendaConfig(e?.tiendaConfig).cuentasHabilitadas)
      throw new BadRequestException('Activa las cuentas de cliente en Mi tienda para vincular puntos');
    await this.registros.preparar();
    const codigo = Array.from({ length: 8 }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join('');
    await this.registros.crear(user.empresaId, 'VINCULO', this.hashCodigo(user.empresaId, codigo), { vence: Date.now() + 1800000, por: user.id }, { cifrar: false, referenciaId: String(c.id) });
    return { codigo, venceEnMinutos: 30 };
  }
  private hashCodigo(empresaId: number, codigo: string) {
    return createHash('sha256').update(`${empresaId}:${codigo.toUpperCase().replace(/[^A-Z0-9]/g, '')}`).digest('hex');
  }
  async vincular(slug: string, autorizacion: unknown, body: any) {
    const { e, r, c } = await this.extras.cliente(slug, autorizacion);
    const codigo = typeof body?.codigo === 'string' ? body.codigo : '';
    const v = codigo ? await this.registros.buscar(e.id, 'VINCULO', this.hashCodigo(e.id, codigo)) : null;
    if (!v || (v.datos as any).vence < Date.now()) throw new BadRequestException('Código inválido o vencido. Pídelo de nuevo en caja.');
    await this.registros.eliminar(v);
    await this.registros.actualizar(r, { datos: { ...c, clientePosId: Number(v.referenciaId) } });
    return this.resumenCuenta(slug, autorizacion);
  }
  async resumenCuenta(slug: string, autorizacion: unknown) {
    const { e, c } = await this.extras.cliente(slug, autorizacion);
    const reglas = puntosConfig(e.fidelizacionConfig);
    let puntos: number | null = null;
    if (c.clientePosId) {
      const pos = await this.prisma.cliente.findFirst({ where: { id: c.clientePosId, empresaId: e.id, activo: true }, select: { puntos: true } });
      puntos = pos ? pos.puntos : null;
    }
    return {
      favoritos: c.favoritos || [],
      puntos: { vinculado: puntos !== null, saldo: puntos ?? 0, habilitado: reglas.habilitado, valorPunto: reglas.valorPunto },
    };
  }
  // Valida el canje contra el saldo actual; el descuento real ocurre al aceptar la venta en caja.
  async calcularCanje(slug: string, empresa: any, autorizacion: unknown, puntos: unknown, disponible: number) {
    if (!Number.isInteger(puntos) || (puntos as number) < 1) throw new BadRequestException('Cantidad de puntos inválida');
    const x = await this.extras.clienteOpcional(slug, empresa.id, autorizacion);
    if (!x?.c.clientePosId) throw new BadRequestException('Vincula tus puntos en Mi cuenta antes de canjearlos');
    const reglas = puntosConfig(empresa.fidelizacionConfig);
    if (!reglas.habilitado || reglas.valorPunto <= 0) throw new BadRequestException('El canje de puntos no está habilitado');
    const pos = await this.prisma.cliente.findFirst({ where: { id: x.c.clientePosId, empresaId: empresa.id, activo: true }, select: { puntos: true } });
    if (!pos || pos.puntos < (puntos as number)) throw new BadRequestException('No tienes puntos suficientes');
    const valor = Math.round((puntos as number) * reglas.valorPunto * 100) / 100;
    if (valor > disponible) throw new BadRequestException('El canje supera el valor de los productos');
    return { puntos: puntos as number, valor, clientePosId: x.c.clientePosId };
  }
  async registrarCanje(empresaId: number, pedidoWebId: string, canje: { puntos: number; valor: number; clientePosId: number }, tx: any) {
    await this.registros.crear(empresaId, 'CANJE_PEDIDO', pedidoWebId, canje, { cifrar: false, referenciaId: String(canje.clientePosId) }, tx);
  }

  // ---------- Favoritos ----------
  async favorito(slug: string, autorizacion: unknown, body: any) {
    const { e, r, c } = await this.extras.cliente(slug, autorizacion);
    if (!Number.isSafeInteger(body?.productoId) || typeof body?.favorito !== 'boolean') throw new BadRequestException('Favorito inválido');
    if (body.favorito && !(await this.prisma.producto.count({ where: { id: body.productoId, empresaId: e.id, activo: true } })))
      throw new NotFoundException('Producto no disponible');
    const actuales = new Set(c.favoritos || []);
    if (body.favorito) actuales.add(body.productoId);
    else actuales.delete(body.productoId);
    const favoritos = [...actuales].slice(-100);
    await this.registros.actualizar(r, { datos: { ...c, favoritos } });
    return { favoritos };
  }

  // ---------- Reseñas verificadas ----------
  async crearResena(slug: string, autorizacion: unknown, body: any) {
    const { e, t, r, c } = await this.extras.cliente(slug, autorizacion);
    if (!t.resenasHabilitadas) throw new BadRequestException('Esta tienda no recibe reseñas');
    const d = validarResena(body);
    // Solo quien recibió el producto en un pedido entregado puede opinar.
    const enlaces = await this.registros.listar(e.id, 'PEDIDO_CLIENTE', { referenciaId: r.id }, 200);
    const entregados = enlaces.length
      ? await this.prisma.pedidoWeb.findMany({ where: { empresaId: e.id, id: { in: enlaces.map((x) => x.clave) }, estado: 'ENTREGADO' }, select: { items: true } })
      : [];
    if (!entregados.some((p) => (p.items as any[]).some((i) => i.productoId === d.productoId)))
      throw new BadRequestException('Puedes opinar sobre productos que recibiste en un pedido entregado');
    const clave = `${r.id}:${d.productoId}`;
    const datos = { ...d, nombre: c.nombre.split(/\s+/)[0].slice(0, 40), fecha: new Date().toISOString() };
    const previa = await this.registros.buscar(e.id, 'RESENA', clave);
    // Editar una reseña la devuelve a moderación.
    if (previa) await this.registros.actualizar(previa, { datos, estado: 'PENDIENTE', cifrar: false });
    else await this.registros.crear(e.id, 'RESENA', clave, datos, { cifrar: false, estado: 'PENDIENTE', referenciaId: String(d.productoId) });
    return { ok: true, estado: 'PENDIENTE' };
  }
  async resenasAdmin(user: Usuario) {
    return (await this.registros.listar(user.empresaId, 'RESENA', {}, 500)).map((r) => ({ id: r.id, estado: r.estado, ...(r.datos as any) }));
  }
  async moderarResena(user: Usuario, id: string, body: any) {
    const r = await this.registros.obtener(user.empresaId, 'RESENA', id);
    if (!r) throw new NotFoundException('Reseña no encontrada');
    const estado = { PUBLICAR: 'PUBLICADA', OCULTAR: 'OCULTA' }[body?.accion as string];
    if (!estado) throw new BadRequestException('Acción inválida');
    await this.registros.actualizar(r, { estado });
    return { id, estado };
  }
  // Resumen público por producto: promedio, total y las cinco más recientes publicadas.
  async resenasPublicas(empresaId: number) {
    const filas = await this.registros.listar(empresaId, 'RESENA', { estado: 'PUBLICADA' }, 2000);
    const porProducto = new Map<number, any[]>();
    for (const r of filas) {
      const d = r.datos as any;
      porProducto.set(d.productoId, [...(porProducto.get(d.productoId) || []), d]);
    }
    return [...porProducto].map(([productoId, lista]) => ({
      productoId,
      total: lista.length,
      promedio: Math.round((lista.reduce((s, x) => s + x.estrellas, 0) / lista.length) * 10) / 10,
      ultimas: lista.slice(0, 5).map((x) => ({ nombre: x.nombre, estrellas: x.estrellas, texto: x.texto, fecha: x.fecha })),
    }));
  }

  // ---------- Estadísticas de la tienda web ----------
  async estadisticas(user: Usuario, dias: unknown) {
    const n = Number(dias);
    const periodo = [7, 30, 90].includes(n) ? n : 30;
    const desde = new Date(Date.now() - periodo * 86400000);
    const pedidos = await this.prisma.pedidoWeb.findMany({
      where: { empresaId: user.empresaId, creadoEn: { gte: desde } },
      select: { id: true, estado: true, total: true, subtotal: true, costoDomicilio: true, items: true, zona: true, creadoEn: true },
      take: 20000,
    });
    const vendidos = pedidos.filter((p) => ['ACEPTADO', 'EN_CAMINO', 'ENTREGADO'].includes(p.estado));
    const ventas = vendidos.reduce((s, p) => s + Number(p.total), 0);
    const productos = new Map<string, { nombre: string; cantidad: number; ventas: number }>();
    for (const p of vendidos)
      for (const i of p.items as any[]) {
        const k = String(i.productoId);
        const x = productos.get(k) || { nombre: i.nombre, cantidad: 0, ventas: 0 };
        x.cantidad += i.cantidad;
        x.ventas += Number(i.precioUnitario ?? i.precio) * i.cantidad;
        productos.set(k, x);
      }
    const tipo = (z: string) => (z?.startsWith('Mesa ') ? 'MESA' : z === 'Recoger en tienda' ? 'RECOGER' : 'DOMICILIO');
    const usos = (await this.registros.listar(user.empresaId, 'CUPON_USO', { estado: 'APLICADO' }, 20000)).filter((u) => u.creadoEn >= desde);
    const reservas = (await this.registros.listar(user.empresaId, 'RESERVA', {}, 20000)).filter((r) => r.creadoEn >= desde);
    const cuentas = (await this.registros.listar(user.empresaId, 'CLIENTE', {}, 20000)).filter((r) => r.creadoEn >= desde);
    const suscriptores = (await this.registros.listar(user.empresaId, 'SUSCRIPTOR', { estado: 'ACTIVO' }, 20000)).filter((r) => r.creadoEn >= desde);
    const contar = (lista: { estado: string }[]) => lista.reduce<Record<string, number>>((a, x) => ({ ...a, [x.estado]: (a[x.estado] || 0) + 1 }), {});
    return {
      periodo,
      pedidos: { total: pedidos.length, porEstado: contar(pedidos), porEntrega: pedidos.reduce<Record<string, number>>((a, p) => ({ ...a, [tipo(p.zona)]: (a[tipo(p.zona)] || 0) + 1 }), {}) },
      ventas: { total: Math.round(ventas), ticketPromedio: vendidos.length ? Math.round(ventas / vendidos.length) : 0, pedidos: vendidos.length },
      conversion: pedidos.length ? Math.round((vendidos.length / pedidos.length) * 100) : 0,
      cupones: { usos: usos.length, descuento: Math.round(usos.reduce((s, u) => s + Number((u.datos as any).descuento), 0)) },
      productos: [...productos.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10),
      reservas: { total: reservas.length, porEstado: contar(reservas) },
      cuentasNuevas: cuentas.length,
      suscriptoresNuevos: suscriptores.length,
    };
  }

  validarCorreoAviso(v: unknown) {
    if (v == null || v === '') return '';
    const c = normalizarCorreo(v);
    if (!c) throw new BadRequestException('Correo para avisos inválido');
    return c;
  }
}
