import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { texto, tiendaConfig } from './reglas';
import {
  ahoraColombia,
  Cupon,
  descuentoCupon,
  exigirConsentimiento,
  normalizarCodigo,
  normalizarCorreo,
  normalizarTelefono,
  rechazarBot,
  validarContrasena,
  validarCuponAdmin,
  validarReserva,
} from './tienda-extras.reglas';
import {
  firmarCliente,
  indiceCiego,
  leerCliente,
  Registro,
  TiendaRegistros,
} from './tienda-registros';

type Usuario = { id: number; empresaId: number; rol: string };
type Cliente = {
  nombre: string;
  correo: string;
  telefono: string;
  hash: string;
  sesion: number;
  intentos: number;
  bloqueadoHasta: number;
  consentimientoEn: string;
  codigo?: { hash: string; vence: number; intentos: number; creado: number } | null;
  favoritos?: number[];
  clientePosId?: number | null;
};
export type ClienteWeb = Cliente;
type Reserva = {
  nombre: string;
  telefono: string;
  correo: string;
  fecha: string;
  hora: string;
  personas: number;
  nota: string;
  avisos?: boolean;
  motivo?: string;
  gestionadoPor?: number;
};
type Suscriptor = {
  nombre: string;
  correo: string;
  whatsapp: string;
  consentimientoEn: string;
};

const SESION_MS = 7 * 24 * 3600000;
// Hash de referencia para comparar en tiempo similar aunque el correo no exista.
let hashFalso: Promise<string> | undefined;
const HASH_FALSO = () => (hashFalso ??= bcrypt.hash('cuenta-inexistente', 12));
const CLAVE_IDEMPOTENCIA = /^[a-zA-Z0-9-]{20,80}$/;

@Injectable()
export class TiendaExtrasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registros: TiendaRegistros,
    private readonly notificaciones: NotificacionesService,
  ) {}

  private async tienda(slug: string) {
    const e = await this.prisma.empresa.findUnique({ where: { tiendaSlug: slug } });
    const t = tiendaConfig(e?.tiendaConfig);
    if (!e?.activo || !t.publicada) throw new NotFoundException('Tienda no disponible');
    return { e, t };
  }

  // ---------- Cupones ----------
  private cupon(r: Registro) {
    return { id: r.id, ...(r.datos as Cupon) };
  }
  async cupones(user: Usuario) {
    return (await this.registros.listar(user.empresaId, 'CUPON')).map((r) =>
      this.cupon(r),
    );
  }
  async guardarCupon(user: Usuario, body: any, id?: string) {
    await this.registros.preparar();
    if (id) {
      const r = await this.registros.obtener(user.empresaId, 'CUPON', id);
      if (!r) throw new NotFoundException('Cupón no encontrado');
      const previo = r.datos as Cupon;
      if (normalizarCodigo(body?.codigo) !== previo.codigo)
        throw new BadRequestException('El código de un cupón existente no se puede cambiar');
      const c = validarCuponAdmin(body, previo);
      return this.cupon(await this.registros.actualizar(r, { datos: c, cifrar: false }));
    }
    const c = validarCuponAdmin(body);
    if (await this.registros.buscar(user.empresaId, 'CUPON', c.codigo))
      throw new ConflictException('Ya existe un cupón con ese código');
    try {
      return this.cupon(
        await this.registros.crear(user.empresaId, 'CUPON', c.codigo, c, { cifrar: false }),
      );
    } catch (e) {
      if (e?.code === 'P2002') throw new ConflictException('Ya existe un cupón con ese código');
      throw e;
    }
  }
  async eliminarCupon(user: Usuario, id: string) {
    const r = await this.registros.obtener(user.empresaId, 'CUPON', id);
    if (!r) throw new NotFoundException('Cupón no encontrado');
    // Un cupón usado se conserva para que la venta siga explicando su descuento.
    if ((r.datos as Cupon).usos > 0)
      throw new ConflictException('Este cupón ya se usó; desactívalo en lugar de eliminarlo');
    await this.registros.eliminar(r);
    return { ok: true };
  }
  async validarCupon(slug: string, body: any) {
    const { e } = await this.tienda(slug);
    const codigo = normalizarCodigo(body?.codigo);
    const subtotal = Number(body?.subtotal);
    if (!codigo || !Number.isFinite(subtotal) || subtotal < 0)
      throw new BadRequestException('Cupón no válido');
    const r = await this.registros.buscar(e.id, 'CUPON', codigo);
    if (!r) throw new BadRequestException('Cupón no válido');
    const c = r.datos as Cupon;
    const descuento = descuentoCupon(c, subtotal, ahoraColombia().fecha);
    return { codigo, descuento, descripcion: c.descripcion };
  }
  // Dentro de la transacción del pedido: si el cupón cambió o se agotó, el pedido no se crea.
  async calcularCupon(empresaId: number, codigo: unknown, subtotal: number, tx?: any) {
    const c = normalizarCodigo(codigo);
    if (!c) throw new BadRequestException('Cupón no válido');
    const r = await this.registros.buscar(empresaId, 'CUPON', c, tx);
    if (!r) throw new BadRequestException('Cupón no válido');
    return { r, descuento: descuentoCupon(r.datos as Cupon, subtotal, ahoraColombia().fecha) };
  }
  async aplicarCupon(r: Registro, pedidoWebId: string, descuento: number, tx: any) {
    const c = r.datos as Cupon;
    await this.registros.actualizar(r, { datos: { ...c, usos: c.usos + 1 }, cifrar: false }, tx);
    await this.registros.crear(
      r.empresaId,
      'CUPON_USO',
      pedidoWebId,
      { codigo: c.codigo, cuponId: r.id, descuento },
      { cifrar: false, estado: 'APLICADO', referenciaId: r.id },
      tx,
    );
  }
  async usoCupon(empresaId: number, pedidoWebId: string, tx?: any) {
    const u = await this.registros.buscar(empresaId, 'CUPON_USO', pedidoWebId, tx);
    return u?.estado === 'APLICADO' ? (u.datos as { codigo: string; descuento: number }) : null;
  }
  // Un pedido rechazado devuelve el uso al cupón.
  async liberarCupon(empresaId: number, pedidoWebId: string, tx: any) {
    const u = await this.registros.buscar(empresaId, 'CUPON_USO', pedidoWebId, tx);
    if (!u || u.estado !== 'APLICADO') return;
    await this.registros.actualizar(u, { estado: 'ANULADO' }, tx);
    const r = await this.registros.obtener(empresaId, 'CUPON', u.referenciaId!, tx);
    if (r) {
      const c = r.datos as Cupon;
      await this.registros.actualizar(
        r,
        { datos: { ...c, usos: Math.max(0, c.usos - 1) }, cifrar: false },
        tx,
      );
    }
  }

  // ---------- Reservas ----------
  private vistaReserva(r: Registro, d: Reserva) {
    return {
      id: r.id,
      estado: r.estado,
      fecha: d.fecha,
      hora: d.hora,
      personas: d.personas,
      motivo: d.motivo || '',
    };
  }
  async reservar(slug: string, body: any) {
    const { e, t } = await this.tienda(slug);
    if (!t.reservasHabilitadas)
      throw new BadRequestException('Esta tienda no recibe reservas en línea');
    const clave = typeof body?.clave === 'string' ? body.clave : '';
    if (!CLAVE_IDEMPOTENCIA.test(clave)) throw new BadRequestException('Identificador inválido');
    const previa = await this.registros.buscar(e.id, 'RESERVA', clave);
    if (previa) return this.vistaReserva(previa, this.registros.abrir<Reserva>(previa));
    const d: Reserva = { ...validarReserva(body, t, ahoraColombia()), avisos: body?.avisosWhatsapp === true };
    const indice = indiceCiego(e.id, 'TELEFONO', d.telefono);
    const pendientes = await this.registros.listar(
      e.id,
      'RESERVA',
      { referenciaId: indice, estado: 'PENDIENTE' },
      5,
    );
    if (pendientes.length >= 3)
      throw new BadRequestException(
        'Ya tienes reservas pendientes de confirmar. Contacta a la tienda.',
      );
    try {
      const r = await this.registros.crear(e.id, 'RESERVA', clave, d, {
        estado: 'PENDIENTE',
        referenciaId: indice,
      });
      return this.vistaReserva(r, d);
    } catch (err) {
      if (err?.code === 'P2002') {
        const r = await this.registros.buscar(e.id, 'RESERVA', clave);
        if (r) return this.vistaReserva(r, this.registros.abrir<Reserva>(r));
      }
      throw err;
    }
  }
  async reserva(slug: string, id: string) {
    const { e } = await this.tienda(slug);
    const r = await this.registros.obtener(e.id, 'RESERVA', String(id).slice(0, 36));
    if (!r) throw new NotFoundException('Reserva no encontrada');
    return this.vistaReserva(r, this.registros.abrir<Reserva>(r));
  }
  private corteReservas() {
    const limite = new Date(`${ahoraColombia().fecha}T00:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() - 180);
    return limite.toISOString().slice(0, 10);
  }
  // Minimización: los datos personales de reservas con más de 180 días se eliminan.
  // Solo dentro de peticiones de escritura, que respetan las pausas de mantenimiento.
  private async purgarReservas(empresaId: number) {
    const corte = this.corteReservas();
    const antiguas = (await this.registros.listar(empresaId, 'RESERVA', {}, 1000))
      .filter((r) => this.registros.abrir<Reserva>(r).fecha < corte)
      .slice(0, 50);
    for (const r of antiguas) await this.registros.eliminar(r);
  }
  async reservasAdmin(user: Usuario) {
    const corte = this.corteReservas();
    const resultado: any[] = [];
    for (const r of await this.registros.listar(user.empresaId, 'RESERVA', {}, 500)) {
      const d = this.registros.abrir<Reserva>(r);
      if (d.fecha < corte) continue;
      resultado.push({ ...this.vistaReserva(r, d), nombre: d.nombre, telefono: d.telefono, correo: d.correo, nota: d.nota, creadoEn: r.creadoEn });
    }
    return resultado.sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
  }
  async gestionarReserva(user: Usuario, id: string, body: any) {
    const r = await this.registros.obtener(user.empresaId, 'RESERVA', id);
    if (!r) throw new NotFoundException('Reserva no encontrada');
    const transiciones: Record<string, [string[], string]> = {
      CONFIRMAR: [['PENDIENTE'], 'CONFIRMADA'],
      RECHAZAR: [['PENDIENTE'], 'RECHAZADA'],
      CANCELAR: [['CONFIRMADA'], 'CANCELADA'],
      ASISTIO: [['CONFIRMADA'], 'ASISTIO'],
      NO_ASISTIO: [['CONFIRMADA'], 'NO_ASISTIO'],
    };
    const paso = transiciones[body?.accion];
    if (!paso) throw new BadRequestException('Acción inválida');
    if (!paso[0].includes(r.estado))
      throw new ConflictException('La reserva ya cambió de estado. Actualiza la lista.');
    const d = this.registros.abrir<Reserva>(r);
    const motivo = ['RECHAZAR', 'CANCELAR'].includes(body.accion)
      ? texto(body.motivo, 'Motivo', 300, true)
      : d.motivo;
    const n = await this.registros.actualizar(r, {
      estado: paso[1],
      datos: { ...d, motivo, gestionadoPor: user.id },
    });
    await this.purgarReservas(user.empresaId);
    return { ...this.vistaReserva(n, d), motivo };
  }
  async reservasPendientes(empresaId: number) {
    return (
      await this.registros.listar(empresaId, 'RESERVA', { estado: 'PENDIENTE' }, 200)
    ).length;
  }

  // ---------- Boletín ----------
  private canal(body: any) {
    const correo = body?.correo ? normalizarCorreo(body.correo) : '';
    const whatsapp = body?.whatsapp ? normalizarTelefono(body.whatsapp) : '';
    if ((body?.correo && !correo) || (body?.whatsapp && !whatsapp))
      throw new BadRequestException('Revisa el correo o el número de WhatsApp');
    if (!correo && !whatsapp)
      throw new BadRequestException('Escribe un correo o un número de WhatsApp');
    return { correo, whatsapp, clave: correo ? `correo:${correo}` : `tel:${whatsapp}` };
  }
  async suscribir(slug: string, body: any) {
    const { e, t } = await this.tienda(slug);
    if (!t.boletinHabilitado) throw new BadRequestException('Esta tienda no tiene boletín activo');
    rechazarBot(body);
    exigirConsentimiento(body);
    const { correo, whatsapp, clave } = this.canal(body);
    const datos: Suscriptor = {
      nombre: texto(body.nombre ?? '', 'Nombre', 100),
      correo,
      whatsapp,
      consentimientoEn: new Date().toISOString(),
    };
    const indice = indiceCiego(e.id, 'SUSCRIPTOR', clave);
    const previo = await this.registros.buscar(e.id, 'SUSCRIPTOR', indice);
    if (previo) await this.registros.actualizar(previo, { datos, estado: 'ACTIVO' });
    else
      try {
        await this.registros.crear(e.id, 'SUSCRIPTOR', indice, datos);
      } catch (err) {
        if (err?.code !== 'P2002') throw err;
      }
    // Misma respuesta si ya existía: no revela quién está suscrito.
    return { ok: true };
  }
  async bajaBoletin(slug: string, body: any) {
    const { e } = await this.tienda(slug);
    rechazarBot(body);
    const { clave } = this.canal(body);
    const r = await this.registros.buscar(e.id, 'SUSCRIPTOR', indiceCiego(e.id, 'SUSCRIPTOR', clave));
    if (r) await this.registros.eliminar(r);
    return { ok: true };
  }
  async suscriptores(user: Usuario) {
    return (await this.registros.listar(user.empresaId, 'SUSCRIPTOR', { estado: 'ACTIVO' }, 5000)).map((r) => {
      const d = this.registros.abrir<Suscriptor>(r);
      return { id: r.id, nombre: d.nombre, correo: d.correo, whatsapp: d.whatsapp, creadoEn: r.creadoEn };
    });
  }
  async eliminarSuscriptor(user: Usuario, id: string) {
    const r = await this.registros.obtener(user.empresaId, 'SUSCRIPTOR', id);
    if (!r) throw new NotFoundException('Suscriptor no encontrado');
    await this.registros.eliminar(r);
    return { ok: true };
  }

  // ---------- Cuentas de cliente ----------
  private sesion(slug: string, r: Registro, d: Cliente) {
    return {
      token: firmarCliente({ e: r.empresaId, s: slug, c: r.id, v: d.sesion, exp: Date.now() + SESION_MS }),
      cliente: { nombre: d.nombre, correo: d.correo, telefono: d.telefono },
    };
  }
  private async habilitadas(slug: string) {
    const x = await this.tienda(slug);
    if (!x.t.cuentasHabilitadas)
      throw new BadRequestException('Esta tienda no tiene cuentas de cliente activas');
    return x;
  }
  // Devuelve null cuando no hay sesión válida; los pedidos de invitados siguen funcionando.
  async clienteOpcional(slug: string, empresaId: number, autorizacion: unknown) {
    const token = typeof autorizacion === 'string' ? autorizacion.replace(/^Bearer\s+/i, '') : '';
    const d = leerCliente(token);
    if (!d || d.s !== slug || d.e !== empresaId) return null;
    const r = await this.registros.obtener(empresaId, 'CLIENTE', d.c);
    if (!r || r.estado !== 'ACTIVO') return null;
    const c = this.registros.abrir<Cliente>(r);
    return c.sesion === d.v ? { r, c } : null;
  }
  async cliente(slug: string, autorizacion: unknown) {
    const { e, t } = await this.habilitadas(slug);
    const x = await this.clienteOpcional(slug, e.id, autorizacion);
    if (!x) throw new UnauthorizedException('Tu sesión venció. Vuelve a ingresar.');
    return { e, t, ...x };
  }
  async registrar(slug: string, body: any) {
    const { e } = await this.habilitadas(slug);
    rechazarBot(body);
    exigirConsentimiento(body);
    const correo = normalizarCorreo(body?.correo);
    if (!correo) throw new BadRequestException('Correo inválido');
    const telefono = normalizarTelefono(body?.telefono);
    if (!telefono) throw new BadRequestException('Teléfono inválido');
    const nombre = texto(body?.nombre, 'Nombre', 100, true);
    const contrasena = validarContrasena(body?.contrasena);
    const clave = indiceCiego(e.id, 'CLIENTE', correo);
    if (await this.registros.buscar(e.id, 'CLIENTE', clave))
      throw new ConflictException('Ya existe una cuenta con ese correo. Ingresa o restablece tu contraseña.');
    const d: Cliente = {
      nombre,
      correo,
      telefono,
      hash: await bcrypt.hash(contrasena, 12),
      sesion: 1,
      intentos: 0,
      bloqueadoHasta: 0,
      consentimientoEn: new Date().toISOString(),
    };
    try {
      const r = await this.registros.crear(e.id, 'CLIENTE', clave, d);
      return this.sesion(slug, r, d);
    } catch (err) {
      if (err?.code === 'P2002')
        throw new ConflictException('Ya existe una cuenta con ese correo. Ingresa o restablece tu contraseña.');
      throw err;
    }
  }
  async ingresar(slug: string, body: any) {
    const { e } = await this.habilitadas(slug);
    const correo = normalizarCorreo(body?.correo);
    const contrasena = typeof body?.contrasena === 'string' ? body.contrasena.slice(0, 128) : '';
    const r = correo ? await this.registros.buscar(e.id, 'CLIENTE', indiceCiego(e.id, 'CLIENTE', correo)) : null;
    const d = r ? this.registros.abrir<Cliente>(r) : null;
    if (d && d.bloqueadoHasta > Date.now())
      throw new HttpException('Demasiados intentos. Espera 15 minutos o restablece tu contraseña.', 429);
    const valida = await bcrypt.compare(contrasena, d?.hash || (await HASH_FALSO()));
    if (!r || !d || !valida || r.estado !== 'ACTIVO') {
      if (r && d) {
        const intentos = d.intentos + 1;
        await this.registros.actualizar(r, {
          datos: { ...d, intentos: intentos >= 5 ? 0 : intentos, bloqueadoHasta: intentos >= 5 ? Date.now() + 900000 : d.bloqueadoHasta },
        }).catch(() => undefined);
      }
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    let actual = r;
    if (d.intentos || d.bloqueadoHasta)
      actual = await this.registros.actualizar(r, { datos: { ...d, intentos: 0, bloqueadoHasta: 0 } });
    return this.sesion(slug, actual, { ...d, intentos: 0, bloqueadoHasta: 0 });
  }
  async perfil(slug: string, autorizacion: unknown) {
    const { e, r, c } = await this.cliente(slug, autorizacion);
    const enlaces = await this.registros.listar(e.id, 'PEDIDO_CLIENTE', { referenciaId: r.id }, 30);
    const pedidos = enlaces.length
      ? await this.prisma.pedidoWeb.findMany({
          where: { empresaId: e.id, id: { in: enlaces.map((x) => x.clave) } },
          select: { id: true, estado: true, total: true, subtotal: true, costoDomicilio: true, items: true, creadoEn: true },
          orderBy: { creadoEn: 'desc' },
        })
      : [];
    return { cliente: { nombre: c.nombre, correo: c.correo, telefono: c.telefono }, pedidos };
  }
  async actualizarPerfil(slug: string, autorizacion: unknown, body: any) {
    const { r, c } = await this.cliente(slug, autorizacion);
    const telefono = normalizarTelefono(body?.telefono);
    if (!telefono) throw new BadRequestException('Teléfono inválido');
    const d = { ...c, nombre: texto(body?.nombre, 'Nombre', 100, true), telefono };
    await this.registros.actualizar(r, { datos: d });
    return { nombre: d.nombre, correo: d.correo, telefono: d.telefono };
  }
  async cambiarContrasena(slug: string, autorizacion: unknown, body: any) {
    const { r, c } = await this.cliente(slug, autorizacion);
    if (!(await bcrypt.compare(String(body?.actual ?? '').slice(0, 128), c.hash)))
      throw new ForbiddenException('La contraseña actual no coincide');
    const nueva = validarContrasena(body?.nueva);
    // Cambiar la contraseña cierra las demás sesiones abiertas.
    const d = { ...c, hash: await bcrypt.hash(nueva, 12), sesion: c.sesion + 1 };
    return this.sesion(slug, await this.registros.actualizar(r, { datos: d }), d);
  }
  async cerrarSesiones(slug: string, autorizacion: unknown) {
    const { r, c } = await this.cliente(slug, autorizacion);
    await this.registros.actualizar(r, { datos: { ...c, sesion: c.sesion + 1 } });
    return { ok: true };
  }
  async eliminarCuenta(slug: string, autorizacion: unknown, body: any) {
    const { e, r, c } = await this.cliente(slug, autorizacion);
    if (!(await bcrypt.compare(String(body?.contrasena ?? '').slice(0, 128), c.hash)))
      throw new ForbiddenException('La contraseña no coincide');
    await this.borrarCliente(e.id, r);
    return { ok: true };
  }
  private async borrarCliente(empresaId: number, r: Registro) {
    for (const enlace of await this.registros.listar(empresaId, 'PEDIDO_CLIENTE', { referenciaId: r.id }, 5000))
      await this.registros.eliminar(enlace);
    await this.registros.eliminar(r);
  }
  async solicitarCodigo(slug: string, body: any) {
    const { e } = await this.habilitadas(slug);
    const correo = normalizarCorreo(body?.correo);
    const r = correo ? await this.registros.buscar(e.id, 'CLIENTE', indiceCiego(e.id, 'CLIENTE', correo)) : null;
    if (r?.estado === 'ACTIVO') {
      const d = this.registros.abrir<Cliente>(r);
      // Un código por minuto como máximo para cada cuenta.
      if (!d.codigo || Date.now() - d.codigo.creado > 60000) {
        const codigo = String(randomInt(0, 1000000)).padStart(6, '0');
        await this.registros.actualizar(r, {
          datos: { ...d, codigo: { hash: this.hashCodigo(r.id, codigo), vence: Date.now() + 900000, intentos: 0, creado: Date.now() } },
        });
        await this.notificaciones.enviarCodigoCuenta(d.correo, e.nombre, codigo);
      }
    }
    // Misma respuesta exista o no la cuenta.
    return { ok: true };
  }
  private hashCodigo(id: string, codigo: string) {
    return createHash('sha256').update(`${id}:${codigo}`).digest('hex');
  }
  async restablecer(slug: string, body: any) {
    const { e } = await this.habilitadas(slug);
    const correo = normalizarCorreo(body?.correo);
    const codigo = typeof body?.codigo === 'string' ? body.codigo.trim() : '';
    const r = correo ? await this.registros.buscar(e.id, 'CLIENTE', indiceCiego(e.id, 'CLIENTE', correo)) : null;
    const d = r ? this.registros.abrir<Cliente>(r) : null;
    const invalido = () => new BadRequestException('Código inválido o vencido. Solicita uno nuevo.');
    if (!r || !d?.codigo || d.codigo.vence < Date.now() || d.codigo.intentos >= 5 || !/^\d{6}$/.test(codigo))
      throw invalido();
    const esperado = Buffer.from(d.codigo.hash, 'hex');
    const recibido = Buffer.from(this.hashCodigo(r.id, codigo), 'hex');
    if (!timingSafeEqual(esperado, recibido)) {
      await this.registros.actualizar(r, { datos: { ...d, codigo: { ...d.codigo, intentos: d.codigo.intentos + 1 } } });
      throw invalido();
    }
    const nueva = validarContrasena(body?.nueva);
    const n: Cliente = { ...d, hash: await bcrypt.hash(nueva, 12), sesion: d.sesion + 1, intentos: 0, bloqueadoHasta: 0, codigo: null };
    return this.sesion(slug, await this.registros.actualizar(r, { datos: n }), n);
  }
  async vincularPedido(empresaId: number, clienteId: string, pedidoWebId: string, tx?: any) {
    await this.registros.crear(empresaId, 'PEDIDO_CLIENTE', pedidoWebId, {}, { cifrar: false, referenciaId: clienteId }, tx);
  }
  async clientesAdmin(user: Usuario) {
    return (await this.registros.listar(user.empresaId, 'CLIENTE', {}, 5000)).map((r) => {
      const d = this.registros.abrir<Cliente>(r);
      return { id: r.id, nombre: d.nombre, correo: d.correo, telefono: d.telefono, creadoEn: r.creadoEn };
    });
  }
  async eliminarClienteAdmin(user: Usuario, id: string) {
    const r = await this.registros.obtener(user.empresaId, 'CLIENTE', id);
    if (!r) throw new NotFoundException('Cuenta no encontrada');
    await this.borrarCliente(user.empresaId, r);
    return { ok: true };
  }
}
