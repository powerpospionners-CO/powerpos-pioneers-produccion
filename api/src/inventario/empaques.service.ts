import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const MAX = 9999999;
function cantidad(valor: unknown, cero = false): number {
  const n = Number(valor);
  if (valor === null || valor === '' || !Number.isFinite(n) || n < (cero ? 0 : 0.001) || n > MAX || new Prisma.Decimal(n).decimalPlaces() > 3)
    throw new BadRequestException('Cantidad inválida: usa hasta tres decimales en gramos');
  return n;
}
export function normalizarEmpaque(datos: any) {
  const ingredienteId = Number(datos.ingredienteId);
  if (!Number.isSafeInteger(ingredienteId) || ingredienteId < 1 || !Array.isArray(datos.items) || !datos.items.length || datos.items.length > 50)
    throw new BadRequestException('Selecciona la materia prima y los productos que empacaste');
  const ids = new Set<number>();
  const items = datos.items.map((i: any) => {
    const productoId = Number(i.productoId), unidades = Number(i.unidades), gramos = cantidad(i.gramos);
    if (!Number.isSafeInteger(productoId) || productoId < 1 || ids.has(productoId) || !Number.isSafeInteger(unidades) || unidades < 1 || unidades > 999999)
      throw new BadRequestException('Cada producto debe aparecer una vez, con una cantidad entera de paquetes');
    ids.add(productoId); return { productoId, unidades, gramos };
  }).sort((a: any,b: any) => a.productoId-b.productoId);
  const mermaGramos = cantidad(datos.mermaGramos ?? 0, true);
  const neto = items.reduce((s: Prisma.Decimal, i: any) => s.plus(new Prisma.Decimal(i.gramos).mul(i.unidades)), new Prisma.Decimal(0));
  const totalGramos = cantidad(neto.plus(mermaGramos).toNumber());
  return { ingredienteId, items, mermaGramos, totalGramos, observacion: String(datos.observacion || '').trim().slice(0,500) };
}

@Injectable()
export class EmpaquesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(actor: any) {
    const [materias, historial] = await Promise.all([
      this.prisma.ingrediente.findMany({ where: { empresaId: actor.empresaId, activo: true, unidad: 'gramos' }, orderBy: { nombre: 'asc' } }),
      this.prisma.auditoria.findMany({ where: { empresaId: actor.empresaId, entidad: 'BodegaEmpaque', detalle: { path: ['sucursalId'], equals: actor.sucursalId } }, include: { usuario: { select: { nombre: true } } }, orderBy: { creadoEn: 'desc' }, take: 100 }),
    ]);
    return { materias, historial };
  }

  private async ejecutar(tipo: string, datos: any, payload: any, actor: any, operar: (tx: Prisma.TransactionClient) => Promise<any>) {
    if (!actor.empresaId || !actor.sucursalId || !actor.id) throw new BadRequestException('Selecciona una sede válida');
    const clave = String(datos.clave || '');
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(clave)) throw new BadRequestException('Falta la clave de la operación');
    const firma = createHash('sha256').update(JSON.stringify({ tipo, payload, sucursalId: actor.sucursalId, usuarioId: actor.id })).digest('hex');
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74221, ${actor.empresaId}::int)`;
      const previa = await tx.auditoria.findFirst({ where: { empresaId: actor.empresaId, entidad: 'BodegaEmpaque', detalle: { path: ['clave'], equals: clave } } });
      if (previa) {
        if ((previa.detalle as any)?.firma !== firma) throw new BadRequestException('Esta clave ya corresponde a otra operación');
        return previa;
      }
      const sede = await tx.sucursal.findFirst({ where: { id: actor.sucursalId, empresaId: actor.empresaId, activo: true } });
      if (!sede) throw new BadRequestException('La sede no está disponible');
      const resultado = await operar(tx);
      return tx.auditoria.create({ data: { empresaId: actor.empresaId, usuarioId: actor.id, accion: tipo, entidad: 'BodegaEmpaque', detalle: { ...resultado, clave, firma, sucursalId: actor.sucursalId } } });
    }, { timeout: 20000 });
  }

  async crearMateria(datos: any, actor: any) {
    const nombre = String(datos.nombre || '').trim();
    const gramos = cantidad(datos.gramos ?? 0, true);
    if (!nombre || nombre.length > 150) throw new BadRequestException('Escribe el nombre de la materia prima');
    return this.ejecutar('CREAR_MATERIA_PRIMA', datos, { nombre, gramos }, actor, async tx => {
      if (await tx.ingrediente.findFirst({ where: { empresaId: actor.empresaId, activo: true, nombre: { equals: nombre, mode: 'insensitive' } } }))
        throw new BadRequestException('Esta materia prima ya existe. Registra una entrada o un conteo sobre la existente');
      const ingrediente = await tx.ingrediente.create({ data: { empresaId: actor.empresaId, nombre, unidad: 'gramos', unidadCompra: 'kg', factorConversion: 1000, stock: gramos, stockMinimo: 0,
        ...(actor.empresaId === 1 ? { adicionales: { create: { empresaId: actor.empresaId, nombre, precio: 0, cantidad: null, disponible: false } } } : {}),
      } });
      await tx.movimientoInventario.create({ data: { ingredienteId: ingrediente.id, usuarioId: actor.id, tipo: 'AJUSTE', cantidadMovida: gramos, stockAnterior: 0, stockNuevo: gramos, descripcion: 'Saldo inicial contado de materia prima sin empacar' } });
      return { ingredienteId: ingrediente.id, materia: nombre, gramos, stockNuevo: gramos };
    });
  }

  async moverMateria(datos: any, actor: any) {
    const ingredienteId = Number(datos.ingredienteId), gramos = cantidad(datos.gramos, datos.tipo === 'CONTEO');
    const tipo = datos.tipo, observacion = String(datos.observacion || '').trim().slice(0,500);
    if (!Number.isSafeInteger(ingredienteId) || ingredienteId < 1 || !['ENTRADA','CONTEO'].includes(tipo) || !observacion)
      throw new BadRequestException('Indica la materia prima, el tipo y la referencia o motivo del movimiento');
    return this.ejecutar(tipo === 'ENTRADA' ? 'ENTRADA_MATERIA_PRIMA' : 'CONTEO_MATERIA_PRIMA', datos, { ingredienteId, gramos, tipo, observacion }, actor, async tx => {
      const materia = await this.materiaBloqueada(tx, ingredienteId, actor.empresaId);
      const anterior = Number(materia.stock), nuevo = tipo === 'ENTRADA' ? cantidad(new Prisma.Decimal(anterior).plus(gramos).toNumber(), true) : gramos;
      await tx.ingrediente.update({ where: { id: ingredienteId }, data: { stock: nuevo } });
      await tx.movimientoInventario.create({ data: { ingredienteId, usuarioId: actor.id, tipo: tipo === 'ENTRADA' ? 'ENTRADA' : 'AJUSTE', cantidadMovida: tipo === 'ENTRADA' ? gramos : Math.abs(nuevo-anterior), stockAnterior: anterior, stockNuevo: nuevo, descripcion: observacion } });
      return { ingredienteId, materia: materia.nombre, gramos, stockAnterior: anterior, stockNuevo: nuevo, observacion };
    });
  }

  private async materiaBloqueada(tx: Prisma.TransactionClient, id: number, empresaId: number) {
    await tx.$queryRaw`SELECT id FROM ingredientes WHERE id=${id} AND "empresaId"=${empresaId} FOR UPDATE`;
    const materia = await tx.ingrediente.findFirst({ where: { id, empresaId, activo: true, unidad: 'gramos' } });
    if (!materia) throw new BadRequestException('Materia prima no disponible en esta empresa; debe estar registrada en gramos');
    return materia;
  }

  async empacar(datos: any, actor: any) {
    const payload = normalizarEmpaque(datos);
    return this.ejecutar('REGISTRAR_EMPAQUE', datos, payload, actor, async tx => {
      const materia = await this.materiaBloqueada(tx, payload.ingredienteId, actor.empresaId);
      if (Number(materia.stock) < payload.totalGramos) throw new BadRequestException('No hay suficiente materia prima en bodega para el empaque y la merma');
      const productos: any[] = [];
      for (const item of payload.items) {
        await tx.$queryRaw`SELECT id FROM productos WHERE id=${item.productoId} AND "empresaId"=${actor.empresaId} FOR UPDATE`;
        const producto = await tx.producto.findFirst({ where: { id: item.productoId, empresaId: actor.empresaId, activo: true } });
        if (!producto || !producto.controlaStock || producto.ventaGranel || producto.esCombo) throw new BadRequestException('El destino debe ser un producto empacado con control de existencias por unidad');
        if (producto.stockActual < 0 || producto.stockActual + item.unidades > MAX) throw new BadRequestException('El stock del producto supera el límite permitido');
        const nuevo = producto.stockActual + item.unidades;
        await tx.producto.update({ where: { id: producto.id }, data: { stockActual: { increment: item.unidades } } });
        await tx.movimientoInventario.create({ data: { productoId: producto.id, usuarioId: actor.id, tipo: 'EMPAQUE', cantidadMovida: item.unidades, stockAnterior: producto.stockActual, stockNuevo: nuevo, descripcion: `Empaque de ${materia.nombre}: ${item.gramos} g por paquete` } });
        productos.push({ ...item, nombre: producto.nombre, stockAnterior: producto.stockActual, stockNuevo: nuevo });
      }
      const stockNuevo = new Prisma.Decimal(materia.stock).minus(payload.totalGramos);
      await tx.ingrediente.update({ where: { id: materia.id }, data: { stock: { decrement: payload.totalGramos } } });
      await tx.movimientoInventario.create({ data: { ingredienteId: materia.id, usuarioId: actor.id, tipo: 'EMPAQUE', cantidadMovida: payload.totalGramos, stockAnterior: materia.stock, stockNuevo, descripcion: `Empaque: ${productos.reduce((s,p)=>s+p.unidades,0)} paquetes; merma ${payload.mermaGramos} g. ${payload.observacion}` } });
      return { ...payload, materia: materia.nombre, productos, stockAnterior: Number(materia.stock), stockNuevo: stockNuevo.toNumber() };
    });
  }
}
