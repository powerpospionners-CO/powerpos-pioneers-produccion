import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { motorBase } from '../prisma/mysql-adapter';
import {
  abrirBold,
  BoldConfig,
  cifrarBold,
  integridadBold,
  metodoBold,
  montoBold,
  validarFirmaBold,
} from './bold.reglas';
import { tiendaConfig } from './reglas';

type Scope = { empresaId: number; sucursalId: number };
@Injectable()
export class BoldService {
  private readonly disponibilidad = new Map<
    string,
    { vence: number; activo: boolean }
  >();
  constructor(private readonly prisma: PrismaService) {}
  private db(tx?: any): any {
    return tx || this.prisma;
  }
  private scope(a: Scope) {
    if (
      !Number.isSafeInteger(a.empresaId) ||
      a.empresaId < 1 ||
      !Number.isSafeInteger(a.sucursalId) ||
      a.sucursalId < 1
    )
      throw new BadRequestException('Selecciona una sucursal válida');
    return { empresaId: a.empresaId, sucursalId: a.sucursalId };
  }
  private aad(r: any) {
    return `${r.empresaId}:${r.sucursalId}:${r.id}`;
  }
  async preparar() {
    // Solo desde la configuración autenticada. Nunca se crea esquema por una petición pública.
    await this.prisma.$executeRawUnsafe(
      motorBase() === 'mysql'
        ? `CREATE TABLE IF NOT EXISTS bold_registros (id VARCHAR(36) NOT NULL PRIMARY KEY, empresaId INT NOT NULL, sucursalId INT NOT NULL, tipo VARCHAR(16) NOT NULL, clave VARCHAR(128) NOT NULL, estado VARCHAR(24) NOT NULL, datos JSON NOT NULL, creadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY bold_clave (empresaId,sucursalId,tipo,clave), KEY bold_listado (empresaId,sucursalId,tipo,creadoEn)) ENGINE=InnoDB`
        : `CREATE TABLE IF NOT EXISTS bold_registros (id VARCHAR(36) PRIMARY KEY, "empresaId" INTEGER NOT NULL, "sucursalId" INTEGER NOT NULL, tipo VARCHAR(16) NOT NULL, clave VARCHAR(128) NOT NULL, estado VARCHAR(24) NOT NULL, datos JSONB NOT NULL, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("empresaId","sucursalId",tipo,clave))`,
    );
  }
  private async actual(a: Scope) {
    try {
      return await this.db().boldRegistro.findFirst({
        where: { ...this.scope(a), tipo: 'CONFIG' },
        orderBy: { creadoEn: 'desc' },
      });
    } catch (e) {
      if (e.code === 'P2021') return null;
      throw e;
    }
  }
  async disponible(a: Scope) {
    // Una tienda sin sucursal receptora puede mostrar catálogo sin ofrecer pagos.
    if (!Number.isSafeInteger(a.sucursalId) || a.sucursalId < 1) return false;
    const scope = this.scope(a),
      key = `${scope.empresaId}:${scope.sucursalId}`,
      cache = this.disponibilidad.get(key);
    if (cache && cache.vence > Date.now()) return cache.activo;
    const r = await this.actual(a);
    const c = r ? abrirBold(r.datos, this.aad(r)) : null;
    const activo = !!(c?.habilitado && c.webhookRegistrado);
    if (this.disponibilidad.size > 2000) this.disponibilidad.clear();
    this.disponibilidad.set(key, { vence: Date.now() + 15000, activo });
    return activo;
  }
  async configuracion(a: Scope) {
    await this.preparar();
    const r = await this.actual(a),
      c = r ? abrirBold(r.datos, this.aad(r)) : null;
    const e = await this.prisma.empresa.findUnique({
      where: { id: a.empresaId },
      select: { tiendaSlug: true },
    });
    const slug = e?.tiendaSlug || '';
    return {
      habilitado: c?.habilitado || false,
      merchantId: c?.merchantId || '',
      identidadConfigurada: !!c?.identidad,
      secretoConfigurado: !!c?.secreto,
      webhookRegistrado: c?.webhookRegistrado || false,
      webhook: slug
        ? `https://api.powerpospioneers.com/tiendas/${encodeURIComponent(slug)}/bold/webhook`
        : '',
      sucursalId: a.sucursalId,
    };
  }
  async configurar(a: Scope, body: any) {
    if (
      !body ||
      typeof body !== 'object' ||
      typeof body.habilitado !== 'boolean' ||
      typeof body.webhookRegistrado !== 'boolean'
    )
      throw new BadRequestException('Configuración de Bold inválida');
    await this.preparar();
    const empresa = await this.prisma.empresa.findUnique({
      where: { id: a.empresaId },
      select: { tiendaConfig: true },
    });
    if (
      !empresa ||
      tiendaConfig(empresa.tiendaConfig).sucursalId !== a.sucursalId
    )
      throw new BadRequestException(
        'Configura Bold desde la sucursal que recibe los pedidos de la tienda',
      );
    const previo = await this.actual(a),
      old = previo ? abrirBold(previo.datos, this.aad(previo)) : null;
    const valor = (nombre: string, anterior = '') => {
      if (body[nombre] !== undefined && typeof body[nombre] !== 'string')
        throw new BadRequestException('Credenciales inválidas');
      const v = (body[nombre] || anterior).trim();
      if (v.length > 512 || /\s/.test(v))
        throw new BadRequestException('Credenciales inválidas');
      return v;
    };
    const c: BoldConfig = {
      habilitado: body.habilitado,
      webhookRegistrado: body.webhookRegistrado,
      merchantId: valor('merchantId', old?.merchantId),
      identidad: valor('identidad', old?.identidad),
      secreto: valor('secreto', old?.secreto),
    };
    if (
      c.habilitado &&
      (!c.webhookRegistrado ||
        !c.merchantId ||
        c.identidad.length < 16 ||
        c.secreto.length < 16 ||
        /test|sandbox/i.test(c.identidad))
    )
      throw new BadRequestException(
        'Para habilitar cobros reales, configura las llaves de producción, el ID del comercio y registra el webhook en Bold',
      );
    const r = {
      id: randomUUID(),
      ...this.scope(a),
      tipo: 'CONFIG',
      clave: randomUUID(),
      estado: c.habilitado ? 'ACTIVO' : 'INACTIVO',
    };
    // Versiones inmutables: una rotación no impide verificar cobros que ya estaban pendientes.
    await this.db().boldRegistro.create({
      data: { ...r, datos: cifrarBold(c, this.aad(r)) },
    });
    this.disponibilidad.delete(`${a.empresaId}:${a.sucursalId}`);
    return this.configuracion(a);
  }
  async intento(p: any, clave: unknown, slug: string) {
    if (
      typeof clave !== 'string' ||
      clave !== p.clave ||
      p.metodoPago !== 'TARJETA'
    )
      throw new NotFoundException('Pago no encontrado');
    const a = this.scope(p);
    return this.prisma.$transaction(async (tx: any) => {
      await this.bloquearPedido(p, tx);
      const fresh = await tx.pedidoWeb.findFirst({ where: { id: p.id, ...a } });
      if (!fresh || fresh.estado !== 'RECIBIDO')
        throw new ConflictException('Este pedido ya fue revisado');
      let r = await this.registro(p, tx);
      const cfg = r
        ? await tx.boldRegistro.findFirst({
            where: { id: r.datos.configId, ...a, tipo: 'CONFIG' },
          })
        : await this.actual(a);
      if (!cfg)
        throw new BadRequestException(
          'Bold no está habilitado para esta tienda',
        );
      const c = abrirBold(cfg.datos, this.aad(cfg));
      if (!c.habilitado || !c.webhookRegistrado || !(await this.disponible(a)))
        throw new BadRequestException(
          'La tienda no recibe nuevos pagos por Bold',
        );
      if (!r) {
        const id = randomUUID();
        r = await tx.boldRegistro.create({
          data: {
            id,
            ...a,
            tipo: 'PAGO',
            clave: p.id,
            estado: 'PENDIENTE',
            datos: {
              configId: cfg.id,
              total: montoBold(fresh.total),
              referencia: `PP-${id}`,
              pedidoWebId: p.id,
              expires: String(BigInt(Date.now() + 20 * 60000) * 1000000n),
            },
          },
        });
      }
      if (!['PENDIENTE', 'RECHAZADO'].includes(r.estado))
        throw new ConflictException(
          'Este pago ya tiene confirmación; revisa su estado',
        );
      if (BigInt(r.datos.expires) < BigInt(Date.now()) * 1000000n)
        throw new ConflictException(
          'El enlace de pago venció. Contacta a la tienda antes de volver a pagar.',
        );
      return {
        referencia: r.datos.referencia,
        total: r.datos.total,
        identidad: c.identidad,
        integridad: integridadBold(
          r.datos.referencia,
          r.datos.total,
          c.secreto,
        ),
        vencimiento: r.datos.expires,
        retorno: `https://${slug}.powerpospioneers.com/?pedido=${encodeURIComponent(p.id)}`,
      };
    });
  }
  private async bloquearPedido(p: any, tx: any) {
    await tx.$queryRaw`SELECT id FROM pedidos_web WHERE id = ${p.id} AND "empresaId" = ${p.empresaId} AND "sucursalId" = ${p.sucursalId} FOR UPDATE`;
  }
  async registro(p: any, tx?: any) {
    try {
      return await this.db(tx).boldRegistro.findFirst({
        where: { ...this.scope(p), tipo: 'PAGO', clave: p.id },
      });
    } catch (e) {
      if (e.code === 'P2021') return null;
      throw e;
    }
  }
  async estado(p: any, tx?: any) {
    if (p.metodoPago !== 'TARJETA') return null;
    const r = await this.registro(p, tx);
    return {
      estado: r?.estado || 'PENDIENTE',
      referencia: r?.datos.referencia || null,
    };
  }
  async verificarParaVenta(p: any, tx: any) {
    const r = await this.registro(p, tx);
    if (
      !r ||
      r.estado !== 'APROBADO' ||
      r.datos.total !== Number(p.total) ||
      !r.datos.paymentId
    )
      throw new ConflictException(
        'Bold todavía no confirma un pago aprobado por el total de este pedido',
      );
    return { registro: r, metodo: metodoBold(r.datos.metodo) };
  }
  async aplicar(r: any, pedidoId: number, tx: any) {
    await tx.boldRegistro.update({
      where: { id: r.id },
      data: { estado: 'APLICADO', datos: { ...r.datos, pedidoId } },
    });
  }
  async validarRechazo(p: any, tx: any) {
    if (p.metodoPago !== 'TARJETA') return;
    const r = await this.registro(p, tx);
    if (
      r &&
      !['PENDIENTE', 'RECHAZADO', 'ANULADO', 'CANCELADO'].includes(r.estado)
    )
      throw new ConflictException(
        'Bold confirmó un pago o requiere revisión. Gestiona la devolución o anulación en Bold antes de cancelar este pedido; no se devuelven fondos automáticamente.',
      );
    if (r && ['PENDIENTE', 'RECHAZADO'].includes(r.estado))
      await this.db(tx).boldRegistro.update({
        where: { id: r.id },
        data: {
          estado: 'CANCELADO',
          datos: {
            ...r.datos,
            canceladoEn: new Date().toISOString(),
            motivoCancelacion: 'Pedido cancelado antes de confirmar el pago',
          },
        },
      });
  }
  async pagos(a: Scope) {
    await this.preparar();
    const rows = await this.db().boldRegistro.findMany({
      where: { ...this.scope(a), tipo: 'PAGO' },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
    return rows.map((r: any) => ({
      id: r.id,
      estado: r.estado,
      total: r.datos.total,
      referencia: r.datos.referencia,
      pedidoWebId: r.clave,
      pedidoId: r.datos.pedidoId,
      creadoEn: r.creadoEn,
    }));
  }
  async webhook(a: Scope, raw: Buffer, firma: unknown) {
    if (!Buffer.isBuffer(raw) || raw.length > 65536)
      throw new BadRequestException('Evento inválido');
    let event: any;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new BadRequestException('Evento inválido');
    }
    const ref = event?.data?.metadata?.reference;
    const id =
      typeof ref === 'string' && /^PP-[a-f\d-]{36}$/.test(ref)
        ? ref.slice(3)
        : '';
    const r = id
      ? await this.db().boldRegistro.findFirst({
          where: { id, ...this.scope(a), tipo: 'PAGO' },
        })
      : null;
    const cfg = r
      ? await this.db().boldRegistro.findFirst({
          where: { id: r.datos.configId, ...this.scope(a), tipo: 'CONFIG' },
        })
      : await this.actual(a);
    if (!cfg) throw new NotFoundException('Integración no configurada');
    const c = abrirBold(cfg.datos, this.aad(cfg));
    validarFirmaBold(raw, firma, c.secreto);
    if (!r) return { recibido: true }; // Eventos de otros canales del mismo comercio no acreditan pedidos web.
    const d = event.data;
    if (
      d.merchant_id !== c.merchantId ||
      d.amount?.currency !== 'COP' ||
      d.amount?.total !== r.datos.total ||
      (d.amount?.tip || 0) !== 0 ||
      d.metadata?.reference !== r.datos.referencia
    )
      throw new BadRequestException(
        'La confirmación de Bold no corresponde al cobro',
      );
    if (
      ![
        'SALE_APPROVED',
        'SALE_REJECTED',
        'VOID_APPROVED',
        'VOID_REJECTED',
      ].includes(event.type)
    )
      return { recibido: true };
    if (
      typeof event.id !== 'string' ||
      !/^[a-zA-Z\d_-]{1,100}$/.test(event.id) ||
      typeof d.payment_id !== 'string' ||
      !/^[a-zA-Z\d_-]{1,100}$/.test(d.payment_id)
    )
      throw new BadRequestException('Identificador de evento inválido');
    if (event.type === 'SALE_APPROVED') metodoBold(d.payment_method);
    const hash = createHash('sha256').update(raw).digest('hex');
    await this.prisma.$transaction(
      async (tx: any) => {
        // Mismo orden de bloqueos que aceptar/rechazar: nunca dos aplicaciones de una venta.
        await this.bloquearPedido({ ...a, id: r.clave }, tx);
        const current = await this.registro({ ...a, id: r.clave }, tx);
        const existe = await tx.boldRegistro.findFirst({
          where: { ...this.scope(a), tipo: 'EVENTO', clave: event.id },
        });
        if (existe) {
          if (existe.datos.hash !== hash)
            throw new ConflictException('Evento de Bold inconsistente');
          return;
        }
        let estado = current.estado;
        let datos = { ...current.datos };
        if (event.type === 'SALE_APPROVED') {
          const cobro = await tx.boldRegistro.findFirst({
            where: { ...this.scope(a), tipo: 'COBRO', clave: d.payment_id },
          });
          if (cobro && cobro.datos.pagoId !== r.id)
            throw new ConflictException(
              'La transacción Bold ya corresponde a otro pedido',
            );
          if (!cobro)
            await tx.boldRegistro.create({
              data: {
                id: randomUUID(),
                ...this.scope(a),
                tipo: 'COBRO',
                clave: d.payment_id,
                estado: 'RECIBIDO',
                datos: { pagoId: r.id },
              },
            });
          if (
            (datos.paymentId && datos.paymentId !== d.payment_id) ||
            ['ANULADO', 'CANCELADO'].includes(estado)
          )
            estado = 'REVISION';
          else if (['PENDIENTE', 'RECHAZADO'].includes(estado)) {
            estado = 'APROBADO';
          }
          if (!datos.paymentId) {
            datos = {
              ...datos,
              paymentId: d.payment_id,
              metodo: d.payment_method,
              confirmadoEn: new Date().toISOString(),
            };
          }
        } else if (event.type === 'SALE_REJECTED' && estado === 'PENDIENTE')
          estado = 'RECHAZADO';
        else if (event.type === 'VOID_APPROVED') {
          if (datos.paymentId && datos.paymentId !== d.payment_id)
            estado = 'REVISION';
          else
            estado = ['APLICADO', 'REVISION'].includes(estado)
              ? 'REVISION'
              : 'ANULADO';
        }
        await tx.boldRegistro.create({
          data: {
            id: randomUUID(),
            ...this.scope(a),
            tipo: 'EVENTO',
            clave: event.id,
            estado: event.type,
            datos: {
              hash,
              pagoId: r.id,
              paymentId: d.payment_id,
              tipo: event.type,
            },
          },
        });
        await tx.boldRegistro.update({
          where: { id: r.id },
          data: { estado, datos },
        });
      },
      { timeout: 1500, maxWait: 500 },
    );
    return { recibido: true };
  }
}
