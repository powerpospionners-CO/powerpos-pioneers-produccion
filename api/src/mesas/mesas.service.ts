import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { motorBase } from '../prisma/mysql-adapter';
import { PedidosService } from '../pedidos/pedidos.service';
import { esMesero } from '../auth/permisos';
import {
  DatosCuenta,
  ESTADOS_RONDA,
  EstadoRonda,
  Linea,
  leerPlano,
  lineaActiva,
  lineaPendiente,
  resumenCuenta,
  totalLineas,
  validarItems,
  validarPlano,
} from './mesas.reglas';

export type ActorMesa = { id: number; nombre?: string; rol: string; empresaId: number; sucursalId: number; permisosUsuario?: unknown };
const SUPERVISOR = ['ADMIN_EMPRESA', 'GERENTE'];
const ahora = () => new Date().toISOString();

// Tabla aditiva mesa_registros: PLANO (uno por sede) y CUENTA (una por mesa abierta; al cerrarse cambia de clave).
@Injectable()
export class MesasService {
  constructor(private readonly prisma: PrismaService, private readonly pedidos: PedidosService) {}

  // DDL aditivo y estático; solo desde acciones de escritura y fuera de transacciones.
  async preparar() {
    const mysql = motorBase() === 'mysql';
    await this.prisma.$executeRawUnsafe(
      mysql
        ? `CREATE TABLE IF NOT EXISTS mesa_registros (id VARCHAR(36) NOT NULL PRIMARY KEY, empresaId INT NOT NULL, sucursalId INT NOT NULL, tipo VARCHAR(16) NOT NULL, clave VARCHAR(64) NOT NULL, estado VARCHAR(16) NOT NULL, mesa INT NULL, datos JSON NOT NULL, version INT NOT NULL DEFAULT 1, usuarioId INT NOT NULL, creadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY mesa_clave (empresaId,sucursalId,tipo,clave), KEY mesa_estado (empresaId,sucursalId,tipo,estado)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        : `CREATE TABLE IF NOT EXISTS mesa_registros (id VARCHAR(36) PRIMARY KEY, "empresaId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL, tipo VARCHAR(16) NOT NULL, clave VARCHAR(64) NOT NULL, estado VARCHAR(16) NOT NULL, mesa INTEGER, datos JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, "usuarioId" INTEGER NOT NULL, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("empresaId","sucursalId",tipo,clave))`,
    );
    if (!mysql)
      await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS mesa_registros_estado ON mesa_registros ("empresaId", "sucursalId", tipo, estado)`);
  }

  private get db(): any {
    return this.prisma;
  }

  private sede(a: ActorMesa) {
    if (!Number.isSafeInteger(a.empresaId) || !Number.isSafeInteger(a.sucursalId) || a.sucursalId < 1) throw new ForbiddenException('Selecciona una sede válida');
    return { empresaId: a.empresaId, sucursalId: a.sucursalId };
  }

  private async leer<T>(fn: () => Promise<T>, vacio: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e?.code === 'P2021') return vacio;
      throw e;
    }
  }

  private async plano(a: ActorMesa) {
    const r = await this.leer(() => this.db.mesaRegistro.findUnique({ where: { empresaId_sucursalId_tipo_clave: { ...this.sede(a), tipo: 'PLANO', clave: 'plano' } } }), null);
    return leerPlano(r?.datos);
  }

  private async abiertas(a: ActorMesa): Promise<any[]> {
    return this.leer(() => this.db.mesaRegistro.findMany({ where: { ...this.sede(a), tipo: 'CUENTA', estado: 'ABIERTA' }, orderBy: { creadoEn: 'asc' }, take: 500 }), []);
  }

  private async cuenta(a: ActorMesa, id: string) {
    const r = await this.leer(() => this.db.mesaRegistro.findFirst({ where: { ...this.sede(a), tipo: 'CUENTA', id: String(id).slice(0, 36) } }), null);
    if (!r) throw new NotFoundException('Cuenta no encontrada');
    return r;
  }

  private abierta(r: any) {
    if (r.estado !== 'ABIERTA') throw new ConflictException('La cuenta ya no está abierta');
    return r.datos as DatosCuenta;
  }

  // Escritura optimista: si otro dispositivo cambió la cuenta, se pide actualizar.
  private async guardar(r: any, datos: DatosCuenta, extra: Record<string, unknown> = {}, db: any = this.db) {
    try {
      const n = await db.mesaRegistro.updateMany({ where: { id: r.id, version: r.version }, data: { datos, version: r.version + 1, ...extra } });
      if (!n.count) throw new ConflictException('La mesa cambió en otro dispositivo. Actualiza e intenta de nuevo.');
    } catch (e) {
      if (e?.code === 'P2002') throw new ConflictException('La mesa de destino ya tiene una cuenta abierta');
      throw e;
    }
    return this.vista({ ...r, datos, version: r.version + 1, ...extra });
  }

  private vista(r: any) {
    const d = r.datos as DatosCuenta;
    return { id: r.id, estado: r.estado, version: r.version, ...resumenCuenta(d), lineas: d.lineas, rondas: d.rondas, cobros: d.cobros };
  }

  private nota(d: DatosCuenta, a: ActorMesa, accion: string, detalle?: string) {
    d.historial = [...(d.historial || []), { accion, por: a.nombre || `Usuario ${a.id}`, en: ahora(), ...(detalle ? { detalle } : {}) }].slice(-100);
  }

  // ---------- Plano y vista general ----------
  async estado(a: ActorMesa) {
    const [plano, cuentas] = await Promise.all([this.plano(a), this.abiertas(a)]);
    const porMesa = new Map(cuentas.map((c) => [c.mesa, c]));
    return {
      mesas: plano.map((m) => {
        const c = porMesa.get(m.numero);
        return { ...m, cuenta: c ? { id: c.id, ...resumenCuenta(c.datos) } : null };
      }),
      puedeCobrar: !esMesero(a.permisosUsuario) && ['ADMIN_EMPRESA', 'GERENTE', 'CAJERO'].includes(a.rol),
      supervisor: SUPERVISOR.includes(a.rol),
    };
  }

  async guardarPlano(a: ActorMesa, body: unknown) {
    if (!SUPERVISOR.includes(a.rol)) throw new ForbiddenException('Solo el administrador o el gerente configuran las mesas');
    const mesas = validarPlano(body);
    await this.preparar();
    const ocupadas = (await this.abiertas(a)).map((c) => c.mesa).filter((n) => !mesas.some((m) => m.numero === n));
    if (ocupadas.length) throw new BadRequestException(`No puedes quitar mesas con cuenta abierta: ${ocupadas.join(', ')}`);
    await this.db.mesaRegistro.upsert({
      where: { empresaId_sucursalId_tipo_clave: { ...this.sede(a), tipo: 'PLANO', clave: 'plano' } },
      create: { id: randomUUID(), ...this.sede(a), tipo: 'PLANO', clave: 'plano', estado: 'ACTIVO', datos: { mesas }, usuarioId: a.id },
      update: { datos: { mesas }, usuarioId: a.id },
    });
    return this.estado(a);
  }

  // ---------- Cuentas ----------
  async ver(a: ActorMesa, id: string) {
    return this.vista(await this.cuenta(a, id));
  }

  async abrir(a: ActorMesa, numero: unknown, personas: unknown) {
    const mesa = Number(numero), n = Number(personas ?? 1);
    if (!(await this.plano(a)).some((m) => m.numero === mesa)) throw new NotFoundException('Esa mesa no está en el plano');
    if (!Number.isSafeInteger(n) || n < 1 || n > 50) throw new BadRequestException('Número de personas no válido');
    await this.preparar();
    const datos: DatosCuenta = { mesa, personas: n, meseroId: a.id, meseroNombre: a.nombre || 'Mesero', abiertaEn: ahora(), lineas: [], rondas: [], cobros: [], historial: [] };
    this.nota(datos, a, 'ABRIR');
    try {
      const r = await this.db.mesaRegistro.create({ data: { id: randomUUID(), ...this.sede(a), tipo: 'CUENTA', clave: `mesa:${mesa}`, estado: 'ABIERTA', mesa, datos, usuarioId: a.id } });
      return this.vista(r);
    } catch (e) {
      if (e?.code === 'P2002') throw new ConflictException('La mesa ya tiene una cuenta abierta');
      throw e;
    }
  }

  async agregar(a: ActorMesa, id: string, items: unknown) {
    const lista = validarItems(items);
    const r = await this.cuenta(a, id);
    const d = this.abierta(r);
    if (d.lineas.length + lista.length > 200) throw new BadRequestException('La cuenta tiene demasiados productos; cóbrala por partes');
    const productos = await this.db.producto.findMany({
      where: { id: { in: [...new Set(lista.map((i) => i.productoId))] }, empresaId: a.empresaId, activo: true },
      select: { id: true, nombre: true, precio: true, categoria: { select: { nombre: true } } },
    });
    const porId = new Map<number, any>(productos.map((p: any) => [p.id, p]));
    const nuevas: Linea[] = lista.map((i) => {
      const p = porId.get(i.productoId);
      if (!p) throw new BadRequestException('Un producto no existe o está inactivo');
      return { id: randomUUID(), productoId: p.id, nombre: p.nombre, categoria: p.categoria?.nombre || '', cantidad: i.cantidad, precioUnitario: Number(p.precio), observacion: i.observacion, ronda: null, pagada: null, anulada: null };
    });
    d.lineas = [...d.lineas, ...nuevas];
    return this.guardar(r, d);
  }

  // Lo no enviado se quita libremente; lo enviado a cocina solo lo anula un supervisor con motivo.
  async quitar(a: ActorMesa, id: string, lineaId: string, motivo: unknown) {
    const r = await this.cuenta(a, id);
    const d = this.abierta(r);
    const l = d.lineas.find((x) => x.id === lineaId);
    if (!l || l.anulada) throw new NotFoundException('Producto no encontrado en la cuenta');
    if (l.pagada !== null) throw new BadRequestException('Ese producto ya se cobró');
    if (l.ronda === null) d.lineas = d.lineas.filter((x) => x.id !== lineaId);
    else {
      const texto = typeof motivo === 'string' ? motivo.trim() : '';
      if (!SUPERVISOR.includes(a.rol)) throw new ForbiddenException('Un producto enviado a cocina solo lo anula el administrador o el gerente');
      if (texto.length < 5 || texto.length > 200) throw new BadRequestException('Escribe el motivo (5 a 200 caracteres)');
      l.anulada = { por: a.id, motivo: texto, en: ahora() };
      this.nota(d, a, 'ANULAR', `${l.cantidad} × ${l.nombre}: ${texto}`);
    }
    return this.guardar(r, d);
  }

  async enviar(a: ActorMesa, id: string) {
    const r = await this.cuenta(a, id);
    const d = this.abierta(r);
    const nuevas = d.lineas.filter((l) => lineaActiva(l) && l.ronda === null);
    if (!nuevas.length) throw new BadRequestException('No hay productos nuevos para enviar');
    const n = d.rondas.reduce((m, x) => Math.max(m, x.n), 0) + 1;
    nuevas.forEach((l) => (l.ronda = n));
    d.rondas = [...d.rondas, { n, enviadaEn: ahora(), enviadaPor: a.nombre || 'Mesero', estado: 'PENDIENTE' }];
    const cuenta = await this.guardar(r, d);
    // La comanda la imprime el dispositivo con las mismas reglas de estaciones del POS.
    return { cuenta, comanda: { numero: `Mesa ${d.mesa} · R${n}`, mesa: d.mesa, ronda: n, creadoEn: ahora(), detalles: nuevas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, observacion: l.observacion, producto: { id: l.productoId, nombre: l.nombre, categoria: { nombre: l.categoria } } })) } };
  }

  // ---------- Cocina ----------
  async cocina(a: ActorMesa) {
    const cuentas = await this.abiertas(a);
    return cuentas.flatMap((c) => {
      const d = c.datos as DatosCuenta;
      return d.rondas
        .filter((r) => r.estado !== 'SERVIDA')
        .map((r) => ({ cuentaId: c.id, mesa: d.mesa, meseroNombre: d.meseroNombre, ...r, lineas: d.lineas.filter((l) => l.ronda === r.n && lineaActiva(l)).map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, observacion: l.observacion })) }))
        .filter((r) => r.lineas.length);
    });
  }

  async estadoRonda(a: ActorMesa, id: string, n: unknown, estado: unknown) {
    if (!ESTADOS_RONDA.includes(estado as EstadoRonda)) throw new BadRequestException('Estado no válido');
    const r = await this.cuenta(a, id);
    const d = this.abierta(r);
    const ronda = d.rondas.find((x) => x.n === Number(n));
    if (!ronda) throw new NotFoundException('Ronda no encontrada');
    ronda.estado = estado as EstadoRonda;
    return this.guardar(r, d);
  }

  // ---------- Traslados ----------
  // Si la mesa de destino está libre la cuenta se mueve; si tiene cuenta, se unen.
  async trasladar(a: ActorMesa, id: string, destino: unknown) {
    const mesa = Number(destino);
    if (!(await this.plano(a)).some((m) => m.numero === mesa)) throw new NotFoundException('La mesa de destino no está en el plano');
    const r = await this.cuenta(a, id);
    const d = this.abierta(r);
    if (d.mesa === mesa) throw new BadRequestException('Elige otra mesa');
    const otra = (await this.abiertas(a)).find((c) => c.mesa === mesa);
    if (!otra) {
      const origen = d.mesa;
      d.mesa = mesa;
      this.nota(d, a, 'TRASLADAR', `Mesa ${origen} → Mesa ${mesa}`);
      return this.guardar(r, d, { clave: `mesa:${mesa}`, mesa });
    }
    if (d.cobros.length) throw new BadRequestException('Esta cuenta ya tiene cobros parciales; cobra el resto antes de unirla');
    const destinoDatos = otra.datos as DatosCuenta;
    const desfase = destinoDatos.rondas.reduce((m, x) => Math.max(m, x.n), 0);
    destinoDatos.lineas = [...destinoDatos.lineas, ...d.lineas.filter(lineaPendiente).map((l) => ({ ...l, ronda: l.ronda === null ? null : l.ronda + desfase }))];
    destinoDatos.rondas = [...destinoDatos.rondas, ...d.rondas.map((x) => ({ ...x, n: x.n + desfase }))];
    destinoDatos.personas += d.personas;
    this.nota(destinoDatos, a, 'UNIR', `Se unió la mesa ${d.mesa}`);
    // Primero se cierra el origen; el historial de ambas cuentas registra la unión.
    this.nota(d, a, 'UNIDA', `Unida a la mesa ${mesa}`);
    return this.prisma.$transaction(async (tx) => {
      await this.guardar(r, d, { estado: 'UNIDA', clave: `cerrada:${r.id}` }, tx);
      return this.guardar(otra, destinoDatos, {}, tx);
    });
  }

  // Pasa productos sin cobrar a otra mesa (abre su cuenta si está libre).
  async moverLineas(a: ActorMesa, id: string, lineaIds: unknown, destino: unknown) {
    if (!Array.isArray(lineaIds) || !lineaIds.length) throw new BadRequestException('Elige los productos a mover');
    const mesa = Number(destino);
    const r = await this.cuenta(a, id);
    const d = this.abierta(r);
    if (d.mesa === mesa) throw new BadRequestException('Elige otra mesa');
    const mover = d.lineas.filter((l) => lineaIds.includes(l.id) && lineaPendiente(l));
    if (mover.length !== new Set(lineaIds).size) throw new BadRequestException('Algún producto ya se cobró o no existe');
    let otra = (await this.abiertas(a)).find((c) => c.mesa === mesa);
    if (!otra) {
      const abierta = await this.abrir(a, mesa, 1);
      otra = await this.cuenta(a, abierta.id);
    }
    const destinoDatos = otra.datos as DatosCuenta;
    const desfase = destinoDatos.rondas.reduce((m, x) => Math.max(m, x.n), 0);
    const rondasMovidas = [...new Set(mover.map((l) => l.ronda).filter((x): x is number => x !== null))];
    destinoDatos.lineas = [...destinoDatos.lineas, ...mover.map((l) => ({ ...l, id: randomUUID(), ronda: l.ronda === null ? null : l.ronda + desfase }))];
    destinoDatos.rondas = [...destinoDatos.rondas, ...d.rondas.filter((x) => rondasMovidas.includes(x.n)).map((x) => ({ ...x, n: x.n + desfase }))];
    d.lineas = d.lineas.filter((l) => !mover.includes(l));
    this.nota(d, a, 'MOVER', `${mover.length} productos a la mesa ${mesa}`);
    this.nota(destinoDatos, a, 'RECIBIR', `${mover.length} productos de la mesa ${d.mesa}`);
    return this.prisma.$transaction(async (tx) => {
      await this.guardar(r, d, {}, tx);
      return this.guardar(otra, destinoDatos, {}, tx);
    });
  }

  async anular(a: ActorMesa, id: string, motivo: unknown) {
    if (!SUPERVISOR.includes(a.rol)) throw new ForbiddenException('Solo el administrador o el gerente anulan una cuenta');
    const texto = typeof motivo === 'string' ? motivo.trim() : '';
    if (texto.length < 5 || texto.length > 200) throw new BadRequestException('Escribe el motivo (5 a 200 caracteres)');
    const r = await this.cuenta(a, id);
    const d = this.abierta(r);
    d.lineas.filter(lineaPendiente).forEach((l) => (l.anulada = { por: a.id, motivo: texto, en: ahora() }));
    this.nota(d, a, 'ANULAR_CUENTA', texto);
    return this.guardar(r, d, { estado: d.cobros.length ? 'COBRADA' : 'ANULADA', clave: `cerrada:${r.id}` });
  }

  // ---------- Cobro ----------
  // Convierte los productos elegidos (o todos) en una venta normal de la caja abierta. Idempotente por claveIdempotencia.
  async cobrar(a: ActorMesa, id: string, body: any) {
    if (esMesero(a.permisosUsuario) || !['ADMIN_EMPRESA', 'GERENTE', 'CAJERO'].includes(a.rol)) throw new ForbiddenException('El cobro lo hace la caja');
    const clave = typeof body?.claveIdempotencia === 'string' ? body.claveIdempotencia.slice(0, 100) : '';
    if (clave.length < 8) throw new BadRequestException('Falta la clave de la operación');
    let r = await this.cuenta(a, id);
    // Reintento de un cobro que ya quedó registrado (se perdió la respuesta).
    const previo = (r.datos as DatosCuenta).cobros.find((c) => c.clave === clave);
    if (previo) return { cuenta: this.vista(r), pedido: { id: previo.pedidoId, numero: previo.numero, total: previo.total } };
    let d = this.abierta(r);
    const pedidas: string[] | null = Array.isArray(body?.lineas) && body.lineas.length ? body.lineas.map(String) : null;
    const elegidas = d.lineas.filter((l) => lineaPendiente(l) && (!pedidas || pedidas.includes(l.id)));
    if (!elegidas.length || (pedidas && elegidas.length !== new Set(pedidas).size)) throw new BadRequestException('Algún producto ya se cobró o no existe');
    let cuenta: any;
    const pedido: any = await this.pedidos.crearPedido(
      {
        sucursalId: a.sucursalId,
        metodoPago: body?.metodoPago,
        pagos: body?.pagos,
        cambio: body?.cambio,
        propina: body?.propina,
        clienteId: body?.clienteId ?? null,
        claveIdempotencia: `mesa:${createHash('sha256').update(`${id}:${clave}`).digest('hex')}`,
        observacion: `Mesa ${d.mesa}`,
        items: elegidas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, ...(l.observacion ? { observacion: l.observacion } : {}) })),
      },
      a.id,
      a.empresaId,
      { entregado: true, confirmar: async (tx, venta) => {
        const ids = new Set(elegidas.map((l) => l.id));
        d.lineas.forEach((l) => { if (ids.has(l.id) && l.pagada === null) l.pagada = venta.id; });
        d.cobros = [...d.cobros, { pedidoId: venta.id, numero: venta.numero, total: Number(venta.total), lineas: [...ids], en: ahora(), clave }];
        this.nota(d, a, 'COBRAR', `${venta.numero} · $${Number(venta.total)}`);
        const completa = !d.lineas.some(lineaPendiente);
        cuenta = await this.guardar(r, d, completa ? { estado: 'COBRADA', clave: `cerrada:${r.id}` } : {}, tx);
      } },
    );
    return { cuenta, pedido };
  }

  totalPendiente(d: DatosCuenta) {
    return totalLineas(d.lineas.filter(lineaPendiente));
  }
}
