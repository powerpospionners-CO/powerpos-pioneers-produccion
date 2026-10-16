import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoriaMovimiento } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { dinero, fechaDia, texto } from './administracion.service';
import type { ActorAdministrativo } from './administracion.service';

export type GastoRecurrenteInput = {
  nombre: string;
  tercero: string;
  categoria: CategoriaMovimiento;
  monto: number;
  diaVencimiento: number;
};
const CATEGORIAS = [
  'NOMINA',
  'SERVICIOS',
  'ARRIENDO',
  'MANTENIMIENTO',
  'IMPUESTOS',
  'OTROS',
];

export function vencimientoMensual(periodo: string, dia: number) {
  fechaDia(`${periodo}-01`);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31)
    throw new BadRequestException(
      'El día de vencimiento debe estar entre 1 y 31',
    );
  const [ano, mes] = periodo.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return fechaDia(
    `${periodo}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`,
  );
}

@Injectable()
export class GastosRecurrentesService {
  constructor(private readonly prisma: PrismaService) {}

  listar(empresaId: number) {
    return this.prisma.gastoRecurrente.findMany({
      where: { empresaId },
      orderBy: { nombre: 'asc' },
      take: 500,
    });
  }

  async crear(datos: GastoRecurrenteInput, actor: ActorAdministrativo) {
    const nombre = texto(datos.nombre, 'Nombre', 100);
    const tercero = texto(datos.tercero, 'Tercero');
    const monto = dinero(datos.monto);
    if (!CATEGORIAS.includes(datos.categoria))
      throw new BadRequestException(
        'Selecciona una categoría de gasto recurrente válida',
      );
    vencimientoMensual('2026-01', datos.diaVencimiento);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${actor.empresaId}::integer)`;
      if (
        !actor.sucursalId ||
        !(await tx.sucursal.findFirst({
          where: {
            id: actor.sucursalId,
            empresaId: actor.empresaId,
            activo: true,
          },
          select: { id: true },
        }))
      )
        throw new BadRequestException(
          'Requiere una sucursal activa de esta empresa',
        );
      if (
        await tx.gastoRecurrente.findUnique({
          where: { empresaId_nombre: { empresaId: actor.empresaId, nombre } },
        })
      )
        throw new BadRequestException(
          'Ya existe una plantilla con este nombre',
        );
      const gasto = await tx.gastoRecurrente.create({
        data: {
          empresaId: actor.empresaId,
          sucursalId: actor.sucursalId,
          usuarioId: actor.id,
          nombre,
          tercero,
          categoria: datos.categoria,
          monto,
          diaVencimiento: datos.diaVencimiento,
        },
      });
      await tx.auditoria.create({
        data: {
          empresaId: actor.empresaId,
          usuarioId: actor.id,
          entidad: 'GASTO_RECURRENTE',
          entidadId: gasto.id,
          accion: 'CREAR',
          detalle: {
            nombre,
            tercero,
            monto: monto.toString(),
            diaVencimiento: datos.diaVencimiento,
            categoria: datos.categoria,
          },
        },
      });
      return gasto;
    });
  }

  async editar(
    id: number,
    datos: { monto?: number; diaVencimiento?: number; activo?: boolean },
    actor: ActorAdministrativo,
  ) {
    if (datos.activo !== undefined && typeof datos.activo !== 'boolean')
      throw new BadRequestException('Estado no válido');
    const monto = datos.monto !== undefined ? dinero(datos.monto) : undefined;
    if (datos.diaVencimiento !== undefined)
      vencimientoMensual('2026-01', datos.diaVencimiento);
    if (
      monto === undefined &&
      datos.activo === undefined &&
      datos.diaVencimiento === undefined
    )
      throw new BadRequestException('No hay cambios para guardar');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${actor.empresaId}::integer)`;
      const anterior = await tx.gastoRecurrente.findFirst({
        where: { id, empresaId: actor.empresaId },
      });
      if (!anterior) throw new NotFoundException('Plantilla no encontrada');
      const actual = await tx.gastoRecurrente.update({
        where: { id },
        data: {
          monto,
          activo: datos.activo,
          diaVencimiento: datos.diaVencimiento,
        },
      });
      await tx.auditoria.create({
        data: {
          empresaId: actor.empresaId,
          usuarioId: actor.id,
          entidad: 'GASTO_RECURRENTE',
          entidadId: id,
          accion: 'ACTUALIZAR',
          detalle: {
            anterior: {
              monto: anterior.monto.toString(),
              activo: anterior.activo,
              diaVencimiento: anterior.diaVencimiento,
            },
            nuevo: {
              monto: actual.monto.toString(),
              activo: actual.activo,
              diaVencimiento: actual.diaVencimiento,
            },
          },
        },
      });
      return actual;
    });
  }

  async generar(id: number, periodo: string, actor: ActorAdministrativo) {
    fechaDia(`${periodo}-01`);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73103, ${actor.empresaId}::integer)`;
      const gasto = await tx.gastoRecurrente.findFirst({
        where: { id, empresaId: actor.empresaId },
      });
      if (!gasto) throw new NotFoundException('Plantilla no encontrada');
      const existente = await tx.cuentaAdministrativa.findUnique({
        where: {
          gastoRecurrenteId_periodoRecurrente: {
            gastoRecurrenteId: id,
            periodoRecurrente: periodo,
          },
        },
      });
      if (existente) return { cuenta: existente, creada: false };
      if (!gasto.activo)
        throw new BadRequestException('La plantilla está inactiva');
      if (
        !(await tx.sucursal.findFirst({
          where: {
            id: gasto.sucursalId,
            empresaId: actor.empresaId,
            activo: true,
          },
          select: { id: true },
        }))
      )
        throw new BadRequestException(
          'La sucursal de esta plantilla está inactiva',
        );
      const documento = `REC-${id}-${periodo}`;
      if (
        await tx.cuentaAdministrativa.findUnique({
          where: {
            empresaId_tipo_documento: {
              empresaId: actor.empresaId,
              tipo: 'PAGAR',
              documento,
            },
          },
        })
      )
        throw new BadRequestException(
          'La referencia reservada del gasto ya está en uso; revisa la cuenta existente',
        );
      const cuenta = await tx.cuentaAdministrativa.create({
        data: {
          empresaId: actor.empresaId,
          sucursalId: gasto.sucursalId,
          usuarioId: actor.id,
          tipo: 'PAGAR',
          categoria: gasto.categoria,
          tercero: gasto.tercero,
          documento,
          descripcion: `${gasto.nombre} · ${periodo}`,
          monto: gasto.monto,
          saldo: gasto.monto,
          vencimiento: vencimientoMensual(periodo, gasto.diaVencimiento),
          gastoRecurrenteId: gasto.id,
          periodoRecurrente: periodo,
        },
      });
      await tx.auditoria.create({
        data: {
          empresaId: actor.empresaId,
          usuarioId: actor.id,
          entidad: 'CUENTA_ADMINISTRATIVA',
          entidadId: cuenta.id,
          accion: 'CREAR',
          detalle: {
            gastoRecurrenteId: id,
            periodo,
            monto: gasto.monto.toString(),
            documento,
          },
        },
      });
      return { cuenta, creada: true };
    });
  }
}
