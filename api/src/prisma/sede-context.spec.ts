import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { contextoSede } from './sede-context';
import { PrismaService } from './prisma.service';

describe('Database routing by authenticated branch', () => {
  let prisma: PrismaService;
  beforeEach(() => {
    prisma = new PrismaService();
  });
  afterEach(async () => {
    await prisma.control.$disconnect();
  });

  it('retains the existing database while isolation is disabled', () => {
    expect(prisma.producto).toBe(prisma.control.producto);
  });

  it('fails closed instead of using the shared database without a branch', () => {
    prisma.aislamientoActivo = true;
    expect(() => prisma.producto.findMany()).toThrow(
      ServiceUnavailableException,
    );
    expect(() => prisma.$transaction([])).toThrow(ServiceUnavailableException);
  });

  it('keeps simultaneous requests with the same record ID in separate databases', async () => {
    prisma.aislamientoActivo = true;
    const run = (empresaId: number, sucursalId: number) => {
      const findUnique = jest.fn(async () => ({
        id: 1,
        empresaId,
        sucursalId,
      }));
      const cliente = { producto: { findUnique } } as unknown as PrismaClient;
      return contextoSede.run({ empresaId, sucursalId, cliente }, async () => {
        await Promise.resolve();
        return prisma.producto.findUnique({ where: { id: 1 } });
      });
    };
    expect(await Promise.all([run(1, 1), run(1, 3), run(2, 2)])).toEqual([
      { id: 1, empresaId: 1, sucursalId: 1 },
      { id: 1, empresaId: 1, sucursalId: 3 },
      { id: 1, empresaId: 2, sucursalId: 2 },
    ]);
    expect(() => prisma.producto.findMany()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('routes transactions to the same branch as model queries', async () => {
    prisma.aislamientoActivo = true;
    const transaction = jest.fn(async () => 'branch');
    const cliente = { $transaction: transaction } as unknown as PrismaClient;
    await contextoSede.run(
      { empresaId: 1, sucursalId: 1, cliente },
      async () => {
        expect(await prisma.$transaction([])).toBe('branch');
      },
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('uses the control database only in an explicit control context', async () => {
    prisma.aislamientoActivo = true;
    const findMany = jest
      .spyOn(prisma.control.producto, 'findMany')
      .mockResolvedValue([]);
    await contextoSede.run('CONTROL', () => prisma.producto.findMany());
    expect(findMany).toHaveBeenCalledTimes(1);
  });
  it('no elimina una conexión nueva cuando falla una verificación anterior', async () => {
    let fallar: (error: Error) => void;
    const pendiente = new Promise<void>((_, reject) => { fallar = reject; });
    const desconectarAnterior = jest.fn().mockResolvedValue(undefined);
    const anterior = { firma: 'conexion-cifrada', cliente: { $disconnect: desconectarAnterior }, verificacion: pendiente };
    const nueva = { firma: 'conexion-cifrada', cliente: { $disconnect: jest.fn() }, verificacion: Promise.resolve() };
    const cache = (prisma as any).clientesSede as Map<number, unknown>;
    cache.set(3, anterior);
    jest.spyOn(prisma.control.baseSede, 'findUnique').mockResolvedValue({ estado: 'ACTIVA', verificadoEn: new Date(), conexionCifrada: 'conexion-cifrada' } as any);
    jest.spyOn(prisma.control.sucursal, 'findFirst').mockResolvedValue({ id: 3 } as any);
    const solicitud = prisma.contexto(2, 3);
    const resultado = expect(solicitud).rejects.toThrow('No se pudo verificar');
    await new Promise(resolve => setImmediate(resolve));
    cache.set(3, nueva);
    fallar!(Object.assign(new Error('No disponible'), { code: 'P1001' }));
    await resultado;
    expect(cache.get(3)).toBe(nueva);
    expect(desconectarAnterior).toHaveBeenCalledTimes(1);
    expect(nueva.cliente.$disconnect).not.toHaveBeenCalled();
  });
});
