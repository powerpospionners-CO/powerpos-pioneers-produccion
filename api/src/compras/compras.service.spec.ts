import { BadRequestException } from '@nestjs/common';
import { CategoriaMovimiento, Prisma } from '@prisma/client';
import { ComprasService } from './compras.service';

describe('ComprasService', () => {
  it('calcula el saldo disponible sin volver a restar el costo de venta', async () => {
    const desde = new Date('2026-10-01T12:00:00.000Z');
    const prisma: any = {
      saldoInicialCuenta: {
        findUnique: jest.fn().mockResolvedValue({
          monto: new Prisma.Decimal(5_000_000),
          desde,
          creadoEn: desde,
          usuario: { nombre: 'Admin' },
        }),
      },
      movimientoFinanciero: {
        findMany: jest.fn().mockResolvedValue([
          { tipo: 'INGRESO', categoria: 'VENTA', monto: new Prisma.Decimal(100_000) },
          { tipo: 'EGRESO', categoria: 'NOMINA', monto: new Prisma.Decimal(20_000) },
          { tipo: 'EGRESO', categoria: 'COSTO_VENTA', monto: new Prisma.Decimal(35_000) },
        ]),
      },
    };
    const service = new ComprasService(prisma);

    const saldo = await service.obtenerSaldo(1);

    expect(saldo.saldoDisponible).toBe(5_080_000);
    expect(prisma.movimientoFinanciero.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { empresaId: 1, fecha: { gte: desde, lte: expect.any(Date) } },
    }));
  });

  it('bloquea los egresos hasta que el admin registre el saldo inicial real', async () => {
    const prisma: any = {
      saldoInicialCuenta: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new ComprasService(prisma);

    await expect(service.registrar({
      categoria: CategoriaMovimiento.NOMINA,
      descripcion: 'Nómina de octubre',
      monto: 1_000_000,
    }, 2, 1, 1)).rejects.toThrow(BadRequestException);
  });

  it('registra compra de mercancía, actualiza existencias y deja el egreso auditado en una transacción', async () => {
    const desde = new Date(Date.now() - 60_000);
    const producto = {
      id: 7,
      empresaId: 1,
      nombre: 'Gaseosa',
      activo: true,
      controlaStock: true,
      esCombo: false,
      ventaGranel: false,
      unidadGranel: null,
      stockActual: 10,
      costo: new Prisma.Decimal(200),
      presentaciones: [{ id: 3, nombre: 'Caja', factorUnidades: 12, activo: true }],
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      producto: {
        findMany: jest.fn().mockResolvedValue([producto]),
        update: jest.fn().mockResolvedValue({}),
      },
      movimientoInventario: { create: jest.fn() },
      compraGasto: {
        create: jest.fn().mockImplementation(({ data }) => ({
          id: 55,
          ...data,
          detalles: data.detalles.create,
        })),
      },
      movimientoFinanciero: { create: jest.fn() },
      auditoria: { create: jest.fn() },
    };
    const prisma: any = {
      saldoInicialCuenta: { findUnique: jest.fn().mockResolvedValue({ desde }) },
      sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    };
    const service = new ComprasService(prisma);

    const compra = await service.registrar({
      categoria: CategoriaMovimiento.COMPRA_MERCANCIA,
      descripcion: 'Compra semanal',
      items: [{ productoId: 7, presentacionId: 3, cantidad: 2, costoUnitario: 3_000 }],
    }, 2, 1, 1);

    expect(compra.monto).toBe(6_000);
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { stockActual: 34, costo: 235.29 },
    });
    expect(tx.movimientoInventario.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tipo: 'ENTRADA',
        cantidadMovida: 24,
        stockAnterior: 10,
        stockNuevo: 34,
      }),
    }));
    expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: 'EGRESO', monto: 6_000, compraGastoId: 55 }),
    }));
    expect(tx.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accion: 'CREAR', entidad: 'COMPRA_GASTO', entidadId: 55 }),
    }));
  });
});
