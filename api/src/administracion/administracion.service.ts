import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoriaMovimiento, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ActorAdministrativo = {
  empresaId: number;
  id: number;
  sucursalId?: number;
};
export type ProveedorInput = {
  nombre: string;
  documento: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  plazoDias?: number;
};
export type CuentaInput = {
  tipo: string;
  tercero: string;
  documento: string;
  descripcion: string;
  monto: number;
  vencimiento: string;
  sucursalId?: number;
};
export type AbonoInput = { monto: number; referencia: string; clave: string };

export function texto(valor: unknown, campo: string, maximo = 250): string {
  if (
    typeof valor !== 'string' ||
    !valor.trim() ||
    valor.trim().length > maximo
  )
    throw new BadRequestException(
      `${campo} es obligatorio y admite hasta ${maximo} caracteres`,
    );
  return valor.trim();
}

export function dinero(valor: unknown): Prisma.Decimal {
  if (
    !['string', 'number'].includes(typeof valor) ||
    !/^\d+(\.\d{1,2})?$/.test(String(valor))
  )
    throw new BadRequestException('El monto debe tener máximo dos decimales');
  const monto = new Prisma.Decimal(String(valor));
  if (monto.lte(0) || monto.gt('99999999.99'))
    throw new BadRequestException(
      'El monto debe ser mayor a cero y hasta $99.999.999,99',
    );
  return monto;
}

export function fechaDia(valor: unknown): Date {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor))
    throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
  const fecha = new Date(`${valor}T00:00:00-05:00`);
  if (
    !Number.isFinite(fecha.getTime()) ||
    new Date(fecha.getTime() - 5 * 3600000).toISOString().slice(0, 10) !== valor
  )
    throw new BadRequestException('Fecha no válida');
  return fecha;
}

const CATEGORIAS_PRESUPUESTO = Object.values(CategoriaMovimiento).filter(
  (categoria) => !['VENTA', 'COSTO_VENTA', 'DOMICILIO'].includes(categoria),
);

@Injectable()
export class AdministracionService {
  constructor(private readonly prisma: PrismaService) {}

  private async auditar(
    tx: Prisma.TransactionClient,
    actor: ActorAdministrativo,
    entidad: string,
    entidadId: number,
    detalle: Prisma.InputJsonValue,
    accion = 'CREAR',
  ) {
    await tx.auditoria.create({
      data: {
        empresaId: actor.empresaId,
        usuarioId: actor.id,
        entidad,
        entidadId,
        detalle,
        accion,
      },
    });
  }

  private async sucursal(
    tx: Prisma.TransactionClient,
    actor: ActorAdministrativo,
    sucursalId?: number,
  ) {
    const id = sucursalId ?? actor.sucursalId;
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !(await tx.sucursal.findFirst({
        where: { id, empresaId: actor.empresaId, activo: true },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'Selecciona una sucursal activa de esta empresa',
      );
    return id;
  }

  proveedores(empresaId: number) {
    return this.prisma.proveedor.findMany({
      where: { empresaId },
      orderBy: { nombre: 'asc' },
      take: 500,
    });
  }

  async crearProveedor(datos: ProveedorInput, actor: ActorAdministrativo) {
    const nombre = texto(datos.nombre, 'Nombre');
    const documento = texto(datos.documento, 'Documento', 40);
    const plazoDias = datos.plazoDias ?? 0;
    if (!Number.isInteger(plazoDias) || plazoDias < 0 || plazoDias > 3650)
      throw new BadRequestException('Plazo de pago no válido');
    const email = datos.email ? texto(datos.email, 'Correo') : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BadRequestException('Correo no válido');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${actor.empresaId}::integer)`;
      if (
        await tx.proveedor.findUnique({
          where: {
            empresaId_documento: { empresaId: actor.empresaId, documento },
          },
        })
      )
        throw new BadRequestException('Este proveedor ya está registrado');
      const proveedor = await tx.proveedor.create({
        data: {
          empresaId: actor.empresaId,
          nombre,
          documento,
          plazoDias,
          email,
          telefono: datos.telefono
            ? texto(datos.telefono, 'Teléfono', 40)
            : null,
          direccion: datos.direccion
            ? texto(datos.direccion, 'Dirección')
            : null,
        },
      });
      await this.auditar(tx, actor, 'PROVEEDOR', proveedor.id, {
        nombre,
        documento,
        plazoDias,
      });
      return proveedor;
    });
  }

  async estadoProveedor(
    id: number,
    activo: boolean,
    actor: ActorAdministrativo,
  ) {
    if (typeof activo !== 'boolean')
      throw new BadRequestException('Estado no válido');
    return this.prisma.$transaction(async (tx) => {
      const resultado = await tx.proveedor.updateMany({
        where: { id, empresaId: actor.empresaId },
        data: { activo },
      });
      if (!resultado.count)
        throw new NotFoundException('Proveedor no encontrado');
      await this.auditar(tx, actor, 'PROVEEDOR', id, { activo }, 'ACTUALIZAR');
      return { ok: true };
    });
  }

  cuentas(empresaId: number, tipo?: string) {
    if (tipo && !['PAGAR', 'COBRAR'].includes(tipo))
      throw new BadRequestException('Tipo de cuenta no válido');
    return this.prisma.cuentaAdministrativa.findMany({
      where: { empresaId, ...(tipo ? { tipo } : {}) },
      include: { abonos: { orderBy: { creadoEn: 'desc' } } },
      orderBy: [{ vencimiento: 'asc' }, { id: 'desc' }],
      take: 500,
    });
  }

  async crearCuenta(datos: CuentaInput, actor: ActorAdministrativo) {
    if (!['PAGAR', 'COBRAR'].includes(datos.tipo))
      throw new BadRequestException('Selecciona cuenta por pagar o cobrar');
    const monto = dinero(datos.monto);
    const vencimiento = fechaDia(datos.vencimiento);
    const documento = texto(datos.documento, 'Documento', 100);
    const tercero = texto(datos.tercero, 'Tercero');
    const descripcion = texto(datos.descripcion, 'Descripción', 500);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${actor.empresaId}::integer)`;
      const sucursalId = await this.sucursal(tx, actor, datos.sucursalId);
      if (
        await tx.cuentaAdministrativa.findUnique({
          where: {
            empresaId_tipo_documento: {
              empresaId: actor.empresaId,
              tipo: datos.tipo,
              documento,
            },
          },
        })
      )
        throw new BadRequestException(
          'Ya existe una cuenta con este documento. Incluye el NIT del tercero en la referencia',
        );
      const cuenta = await tx.cuentaAdministrativa.create({
        data: {
          empresaId: actor.empresaId,
          sucursalId,
          usuarioId: actor.id,
          tipo: datos.tipo,
          tercero,
          documento,
          descripcion,
          monto,
          saldo: monto,
          vencimiento,
        },
      });
      // Registrar una obligación no genera una entrada o salida de efectivo.
      await this.auditar(tx, actor, 'CUENTA_ADMINISTRATIVA', cuenta.id, {
        tipo: datos.tipo,
        monto: monto.toString(),
        documento,
        tercero,
      });
      return cuenta;
    });
  }

  async abonar(id: number, datos: AbonoInput, actor: ActorAdministrativo) {
    const monto = dinero(datos.monto);
    const referencia = texto(datos.referencia, 'Referencia', 100);
    const clave = texto(datos.clave, 'Clave de operación', 100);
    return this.prisma.$transaction(async (tx) => {
      // También serializa claves repetidas entre cuentas de la misma empresa.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${actor.empresaId}::integer)`;
      const cuenta = await tx.cuentaAdministrativa.findFirst({
        where: { id, empresaId: actor.empresaId },
      });
      if (!cuenta) throw new NotFoundException('Cuenta no encontrada');
      const existente = await tx.abonoAdministrativo.findUnique({
        where: { clave },
        include: { cuenta: { select: { empresaId: true } } },
      });
      if (existente) {
        if (
          existente.cuenta.empresaId !== actor.empresaId ||
          existente.cuentaId !== id ||
          !existente.monto.equals(monto) ||
          existente.referencia !== referencia
        )
          throw new BadRequestException('La clave de operación ya está en uso');
        return existente;
      }
      if (cuenta.anulada || cuenta.saldo.lt(monto))
        throw new BadRequestException(
          'El abono supera el saldo o la cuenta está anulada',
        );
      await this.sucursal(tx, actor, cuenta.sucursalId);
      const inicio = await tx.saldoInicialCuenta.findUnique({
        where: { empresaId: actor.empresaId },
      });
      if (!inicio || inicio.desde > new Date())
        throw new BadRequestException(
          'Configura primero el saldo inicial de la cuenta desde Compras',
        );
      const movimiento = await tx.movimientoFinanciero.create({
        data: {
          empresaId: actor.empresaId,
          sucursalId: cuenta.sucursalId,
          usuarioId: actor.id,
          tipo: cuenta.tipo === 'PAGAR' ? 'EGRESO' : 'INGRESO',
          categoria: cuenta.categoria,
          monto,
          descripcion: `Abono ${cuenta.tipo === 'PAGAR' ? 'a proveedor' : 'de cliente'}: ${cuenta.documento} · ${referencia}`,
          comprobante: referencia,
        },
      });
      const abono = await tx.abonoAdministrativo.create({
        data: {
          cuentaId: id,
          usuarioId: actor.id,
          monto,
          referencia,
          clave,
          movimientoId: movimiento.id,
        },
      });
      await tx.cuentaAdministrativa.update({
        where: { id },
        data: { saldo: { decrement: monto } },
      });
      await this.auditar(tx, actor, 'ABONO_ADMINISTRATIVO', abono.id, {
        cuentaId: id,
        monto: monto.toString(),
        referencia,
        movimientoId: movimiento.id,
      });
      return abono;
    });
  }

  async anularCuenta(
    id: number,
    motivoInput: string,
    actor: ActorAdministrativo,
  ) {
    const motivo = texto(motivoInput, 'Motivo', 500);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${actor.empresaId}::integer)`;
      const cuenta = await tx.cuentaAdministrativa.findFirst({
        where: { id, empresaId: actor.empresaId },
        include: { abonos: { select: { id: true }, take: 1 } },
      });
      if (!cuenta) throw new NotFoundException('Cuenta no encontrada');
      if (cuenta.anulada || cuenta.abonos.length || cuenta.compraGastoId)
        throw new BadRequestException(
          'Solo se pueden anular cuentas manuales sin abonos; las compras y demás cuentas requieren conciliación',
        );
      const resultado = await tx.cuentaAdministrativa.update({
        where: { id },
        data: { anulada: true },
      });
      await this.auditar(
        tx,
        actor,
        'CUENTA_ADMINISTRATIVA',
        id,
        { motivo },
        'ANULAR',
      );
      return resultado;
    });
  }

  async resumen(empresaId: number) {
    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
    }).format(new Date());
    const cuentas = await this.prisma.cuentaAdministrativa.groupBy({
      by: ['tipo'],
      where: { empresaId, anulada: false, saldo: { gt: 0 } },
      _sum: { saldo: true },
      _count: true,
    });
    // El vencimiento se considera al terminar el día local, no a medianoche.
    const vencidas = await this.prisma.cuentaAdministrativa.groupBy({
      by: ['tipo'],
      where: {
        empresaId,
        anulada: false,
        saldo: { gt: 0 },
        vencimiento: { lt: fechaDia(hoy) },
      },
      _sum: { saldo: true },
      _count: true,
    });
    return { cuentas, vencidas };
  }

  async movimientos(empresaId: number, desde: string, hasta: string) {
    const fechaDesde = fechaDia(desde);
    const fechaHasta = new Date(fechaDia(hasta).getTime() + 86400000);
    if (
      fechaHasta <= fechaDesde ||
      fechaHasta.getTime() - fechaDesde.getTime() > 366 * 86400000
    )
      throw new BadRequestException('Selecciona un periodo de hasta un año');
    return this.prisma.movimientoFinanciero.findMany({
      where: {
        empresaId,
        fecha: { gte: fechaDesde, lt: fechaHasta },
        categoria: { not: 'COSTO_VENTA' },
      },
      include: { conciliacionAdministrativa: true },
      orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
      take: 1000,
    });
  }

  async conciliar(
    id: number,
    datos: { referencia: string; fechaBanco: string },
    actor: ActorAdministrativo,
  ) {
    const referencia = texto(datos.referencia, 'Referencia bancaria', 100);
    const fechaBanco = fechaDia(datos.fechaBanco);
    if (fechaBanco.getTime() > Date.now())
      throw new BadRequestException('La fecha bancaria no puede ser futura');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM movimientos_financieros WHERE id = ${id} AND "empresaId" = ${actor.empresaId} FOR UPDATE`;
      const movimiento = await tx.movimientoFinanciero.findFirst({
        where: { id, empresaId: actor.empresaId },
      });
      if (!movimiento || movimiento.categoria === 'COSTO_VENTA')
        throw new NotFoundException('Movimiento de dinero no encontrado');
      if (
        await tx.conciliacionAdministrativa.findUnique({
          where: { movimientoId: id },
        })
      )
        throw new BadRequestException('El movimiento ya está conciliado');
      const conciliacion = await tx.conciliacionAdministrativa.create({
        data: {
          empresaId: actor.empresaId,
          usuarioId: actor.id,
          movimientoId: id,
          referencia,
          fechaBanco,
        },
      });
      await this.auditar(tx, actor, 'CONCILIACION_BANCARIA', conciliacion.id, {
        movimientoId: id,
        referencia,
        fechaBanco: fechaBanco.toISOString(),
        monto: movimiento.monto.toString(),
      });
      return conciliacion;
    });
  }

  async presupuesto(periodo: string, empresaId: number) {
    const desde = fechaDia(`${periodo}-01`);
    const hasta = new Date(desde);
    hasta.setUTCMonth(hasta.getUTCMonth() + 1);
    const [presupuestos, ejecucion] = await Promise.all([
      this.prisma.presupuestoAdministrativo.findMany({
        where: { empresaId, periodo },
      }),
      this.prisma.movimientoFinanciero.groupBy({
        by: ['categoria'],
        where: {
          empresaId,
          tipo: 'EGRESO',
          categoria: { not: 'COSTO_VENTA' },
          fecha: { gte: desde, lt: hasta },
        },
        _sum: { monto: true },
      }),
    ]);
    return CATEGORIAS_PRESUPUESTO.map((categoria) => ({
      categoria,
      presupuesto:
        presupuestos.find((p) => p.categoria === categoria)?.monto ??
        new Prisma.Decimal(0),
      ejecutado:
        ejecucion.find((e) => e.categoria === categoria)?._sum.monto ??
        new Prisma.Decimal(0),
    }));
  }

  async guardarPresupuesto(
    datos: { periodo: string; categoria: CategoriaMovimiento; monto: number },
    actor: ActorAdministrativo,
  ) {
    fechaDia(`${datos.periodo}-01`);
    if (!CATEGORIAS_PRESUPUESTO.includes(datos.categoria))
      throw new BadRequestException('Categoría de gasto no válida');
    const monto = dinero(datos.monto);
    return this.prisma.$transaction(async (tx) => {
      const presupuesto = await tx.presupuestoAdministrativo.upsert({
        where: {
          empresaId_periodo_categoria: {
            empresaId: actor.empresaId,
            periodo: datos.periodo,
            categoria: datos.categoria,
          },
        },
        create: {
          empresaId: actor.empresaId,
          usuarioId: actor.id,
          periodo: datos.periodo,
          categoria: datos.categoria,
          monto,
        },
        update: { monto, usuarioId: actor.id },
      });
      await this.auditar(
        tx,
        actor,
        'PRESUPUESTO',
        presupuesto.id,
        {
          periodo: datos.periodo,
          categoria: datos.categoria,
          monto: monto.toString(),
        },
        'ACTUALIZAR',
      );
      return presupuesto;
    });
  }
}
