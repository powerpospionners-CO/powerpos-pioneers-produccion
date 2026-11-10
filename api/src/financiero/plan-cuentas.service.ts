import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CUENTAS_INICIALES, codigoSuperior, validarCodigoPuc, motivoProteccionPuc } from './plan-cuentas.catalogo';
import { motorBase } from '../prisma/mysql-adapter';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

@Injectable()
export class PlanCuentasService implements OnModuleInit {
  private readonly logger = new Logger(PlanCuentasService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (motorBase() !== 'mysql') return;
    // Hostinger ejecuta la API junto a MySQL. Solo se crean las dos tablas nuevas;
    // se valida cada sede mediante el mismo mecanismo de aislamiento de la API.
    const archivo = [
      resolve(__dirname, '../../prisma/mysql/plan-cuentas-puc.sql'),
      resolve(__dirname, '../../../prisma/mysql/plan-cuentas-puc.sql'),
    ].find(existsSync);
    if (!archivo) throw new Error('No se encontró la migración del plan de cuentas');
    const sentencias = readFileSync(archivo, 'utf8').split(';').map(s => s.trim()).filter(Boolean);
    if (sentencias.length !== 2 || sentencias.some(s => !/^CREATE TABLE IF NOT EXISTS (cuentas_puc|asignaciones_puc) \(/.test(s))) {
      throw new Error('La migración PUC debe contener únicamente sus dos tablas nuevas');
    }
    const preparar = async (db: Prisma.TransactionClient) => {
      for (const sql of sentencias) await db.$executeRawUnsafe(sql);
      await db.$queryRawUnsafe('SELECT empresaId,codigo,nombre,activo FROM cuentas_puc LIMIT 0');
      await db.$queryRawUnsafe('SELECT empresaId,origen,registroId,codigo FROM asignaciones_puc LIMIT 0');
    };
    await preparar(this.prisma.control);
    const estado = await this.prisma.estadoAislamiento();
    if (estado?.activo) {
      const sedes = await this.prisma.control.baseSede.findMany({ where: { estado: 'ACTIVA' } });
      for (const sede of sedes) {
        try {
          const contexto = await this.prisma.contexto(sede.empresaId, sede.sucursalId, true);
          await preparar(contexto.cliente);
        } catch {
          this.logger.error(`No se pudo preparar PUC para la empresa ${sede.empresaId}, sede ${sede.sucursalId}. Requiere revisión de esa base; las demás sedes continúan disponibles.`);
        }
      }
    }
  }

  async catalogo(empresaId: number) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      // Las cuentas eliminadas explícitamente no se recrean al volver a consultar el catálogo.
      const bajas = await tx.auditoria.findMany({ where: { empresaId, entidad: 'CUENTA_PUC', accion: 'ELIMINAR' }, select: { detalle: true } });
      const eliminadas = new Set(bajas.map(b => (b.detalle as { codigo?: string } | null)?.codigo));
      const iniciales = CUENTAS_INICIALES.filter(([codigo]) => !eliminadas.has(codigo));
      await tx.cuentaPuc.createMany({
        data: iniciales.map(([codigo, nombre]) => ({ empresaId, codigo, nombre })),
        skipDuplicates: true,
      });
      const cuentas = await tx.cuentaPuc.findMany({ where: { empresaId }, include: { _count: { select: { asignaciones: true } } }, orderBy: { codigo: 'asc' } });
      return cuentas.map(({ _count, ...c }) => {
        const hijos = cuentas.filter(h => codigoSuperior(h.codigo) === c.codigo).length;
        const bloqueoEliminar = motivoProteccionPuc(c.codigo) || (hijos ? 'Tiene subcuentas o auxiliares dependientes.' : _count.asignaciones ? 'Tiene registros clasificados. Puedes desactivarla para conservar el historial.' : null);
        return { ...c, superior: codigoSuperior(c.codigo), nivel: c.codigo.length === 1 ? 'Clase' : c.codigo.length === 2 ? 'Grupo' : c.codigo.length === 4 ? 'Cuenta' : c.codigo.length === 6 ? 'Subcuenta' : 'Auxiliar', hijos, registros: _count.asignaciones, bloqueoEliminar };
      });
    });
  }

  async eliminar(empresaId: number, usuarioId: number, codigo: string) {
    if (!validarCodigoPuc(codigo)) throw new BadRequestException('Código de cuenta inválido');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      const cuenta = await tx.cuentaPuc.findUnique({ where: { empresaId_codigo: { empresaId, codigo } } });
      if (!cuenta) throw new NotFoundException('Cuenta no encontrada');
      const proteccion = motivoProteccionPuc(codigo);
      if (proteccion) throw new BadRequestException(proteccion);
      if (await tx.cuentaPuc.count({ where: { empresaId, codigo: { startsWith: codigo, not: codigo } } })) throw new BadRequestException('Elimina primero las subcuentas y auxiliares dependientes');
      if (await tx.asignacionPuc.count({ where: { empresaId, codigo } })) throw new BadRequestException('La cuenta tiene registros clasificados. Puedes desactivarla para conservar su historial');
      await tx.auditoria.create({ data: { empresaId, usuarioId, accion: 'ELIMINAR', entidad: 'CUENTA_PUC', entidadId: cuenta.id, detalle: { codigo, nombre: cuenta.nombre, activo: cuenta.activo } } });
      await tx.cuentaPuc.delete({ where: { empresaId_codigo: { empresaId, codigo } } });
      return { eliminado: true };
    });
  }

  async guardar(empresaId: number, usuarioId: number, datos: { codigo?: unknown; nombre?: unknown; activo?: unknown; crear?: unknown }) {
    if (!validarCodigoPuc(datos.codigo)) throw new BadRequestException('Usa un código PUC de 1, 2, 4, 6, 8 o 10 dígitos, de las clases 1 a 6');
    const codigo = datos.codigo;
    if (typeof datos.nombre !== 'string' || !datos.nombre.trim() || datos.nombre.trim().length > 150) throw new BadRequestException('El nombre debe tener entre 1 y 150 caracteres');
    if (typeof datos.activo !== 'boolean') throw new BadRequestException('Indica si la cuenta está activa');
    const nombre = datos.nombre.trim(), activo = datos.activo;
    await this.catalogo(empresaId);
    return this.prisma.$transaction(async tx => {
      // Serializa los cambios de catálogo y clasificación dentro de cada empresa.
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      const superior = codigoSuperior(codigo);
      if (superior) {
        const padre = await tx.cuentaPuc.findUnique({ where: { empresaId_codigo: { empresaId, codigo: superior } } });
        if (!padre || (activo && !padre.activo)) throw new BadRequestException('Crea y activa primero la cuenta superior');
      }
      if (!activo && await tx.cuentaPuc.count({ where: { empresaId, codigo: { startsWith: codigo, not: codigo }, activo: true } })) {
        throw new BadRequestException('Desactiva primero las subcuentas y auxiliares');
      }
      const anterior = await tx.cuentaPuc.findUnique({ where: { empresaId_codigo: { empresaId, codigo } } });
      if (datos.crear === true && anterior) throw new ConflictException('Ese código ya existe. Elige otro código para la nueva cuenta');
      const cuenta = await tx.cuentaPuc.upsert({
        where: { empresaId_codigo: { empresaId, codigo } },
        create: { empresaId, codigo, nombre, activo }, update: { nombre, activo },
      });
      await tx.auditoria.create({ data: { empresaId, usuarioId, accion: anterior ? 'EDITAR' : 'CREAR', entidad: 'CUENTA_PUC', detalle: { codigo, nombre, activo, anterior: anterior ? { nombre: anterior.nombre, activo: anterior.activo } : null } } });
      return cuenta;
    });
  }

  async asignar(empresaId: number, usuarioId: number, datos: { origen?: unknown; registroId?: unknown; codigo?: unknown }, transaccion?: Prisma.TransactionClient) {
    if (!['MOVIMIENTO', 'CUENTA'].includes(String(datos.origen)) || !Number.isSafeInteger(datos.registroId) || Number(datos.registroId) < 1 || !validarCodigoPuc(datos.codigo)) {
      throw new BadRequestException('Selecciona un registro y una cuenta válidos');
    }
    const origen = String(datos.origen), registroId = Number(datos.registroId), codigo = datos.codigo as string;
    const operar = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      const registro = origen === 'MOVIMIENTO'
        ? await tx.movimientoFinanciero.findFirst({ where: { id: registroId, empresaId } })
        : await tx.cuentaAdministrativa.findFirst({ where: { id: registroId, empresaId } });
      if (!registro) throw new NotFoundException('Registro no encontrado');
      const excluidas = ['VENTA', 'COSTO_VENTA', 'COMPRA_MERCANCIA', 'COMPRA_INSUMOS'];
      if (excluidas.includes(registro.categoria)) throw new BadRequestException('Esta operación tiene clasificación automática por su origen');
      if (origen === 'MOVIMIENTO' && await tx.abonoAdministrativo.findUnique({ where: { movimientoId: registroId } })) {
        throw new BadRequestException('Clasifica la cuenta original; el abono solo cancela su saldo');
      }
      if (origen === 'CUENTA' && ((registro as any).tipo !== 'PAGAR' || (registro as any).anulada)) {
        throw new BadRequestException('Selecciona una cuenta por pagar vigente');
      }
      const clase = origen === 'MOVIMIENTO' && registro.tipo === 'INGRESO' ? '4' : '5';
      if (!codigo.startsWith(clase) || codigo.length < 6) throw new BadRequestException(`Selecciona una subcuenta o auxiliar de la clase ${clase}`);
      const cuenta = await tx.cuentaPuc.findUnique({ where: { empresaId_codigo: { empresaId, codigo } } });
      if (!cuenta?.activo) throw new BadRequestException('La cuenta no está activa');
      if (await tx.cuentaPuc.count({ where: { empresaId, codigo: { startsWith: codigo, not: codigo } } })) {
        throw new BadRequestException('Selecciona el auxiliar de mayor detalle');
      }
      const anterior = await tx.asignacionPuc.findUnique({ where: { empresaId_origen_registroId: { empresaId, origen, registroId } } });
      const resultado = await tx.asignacionPuc.upsert({
        where: { empresaId_origen_registroId: { empresaId, origen, registroId } },
        create: { empresaId, origen, registroId, codigo, usuarioId }, update: { codigo, usuarioId },
      });
      await tx.auditoria.create({ data: { empresaId, usuarioId, accion: 'EDITAR', entidad: 'CLASIFICACION_PUC', entidadId: registroId, detalle: { origen, anterior: anterior?.codigo ?? null, codigo } } });
      return resultado;
    };
    return transaccion ? operar(transaccion) : this.prisma.$transaction(operar);
  }
}
