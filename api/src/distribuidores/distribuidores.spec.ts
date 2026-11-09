import { BadRequestException } from '@nestjs/common';
import { DistribuidoresService } from './distribuidores.service';

function escenario(pedidosPendientes: any[]) {
  const tx: any = {
    $executeRaw: jest.fn(),
    auditoria: { findMany: jest.fn().mockResolvedValue(pedidosPendientes.map(p=>({entidadId:p.id,detalle:{modalidad:'PAGO_ANTES',pedidoCajaId:p.id+100}}))) },
    pedido: { findMany: jest.fn().mockResolvedValue(pedidosPendientes.map(p=>({id:p.id+100,estado:'ENTREGADO',operacionesCaja:[],cuentaCredito:null}))) },
    distribuidor: { findFirst: jest.fn().mockResolvedValue({ id: 7, empresaId: 1, sucursalId: 2, codigo: 'DIST-001', nombre: 'Juan Pérez' }) },
    pedidoDistribuidor: {
      findMany: jest.fn().mockResolvedValue(pedidosPendientes),
      updateMany: jest.fn().mockResolvedValue({ count: pedidosPendientes.length }),
    },
    movimientoFinanciero: { create: jest.fn().mockResolvedValue({ id: 99 }) },
    liquidacionDistribuidor: { create: jest.fn().mockImplementation(async ({ data }) => ({ id: 55, ...data })) },
  };
  const prisma: any = {
    $transaction: jest.fn((cb: any) => cb(tx)),
    distribuidor: { findFirst: jest.fn().mockResolvedValue({ id: 7, empresaId: 1, sucursalId: 2, codigo: 'DIST-001', nombre: 'Juan Pérez', usuario: null, sucursal: { nombre: 'Principal' } }) },
  };
  const service = new DistribuidoresService(prisma);
  return { tx, prisma, service };
}

describe('Liquidación de distribuidores', () => {
  const pedidos = [
    { id: 1, total: 100000, comisionMonto: 10000 },
    { id: 2, total: 50000, comisionMonto: 5000 },
  ];

  it('agrupa los pedidos pendientes del periodo en una sola liquidación y un solo egreso', async () => {
    const { tx, service } = escenario(pedidos);
    const liquidacion = await service.liquidar(7, 1, 9, '2026-10-01', '2026-10-10');
    expect(tx.movimientoFinanciero.create).toHaveBeenCalledTimes(1);
    expect(tx.movimientoFinanciero.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tipo: 'EGRESO', categoria: 'COMISION_DISTRIBUIDOR', monto: 15000 }),
    }));
    expect(liquidacion.totalComision).toBe(15000);
    expect(liquidacion.cantidadPedidos).toBe(2);
    expect(tx.pedidoDistribuidor.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: { liquidacionId: 55 },
    });
  });

  it('rechaza liquidar si no hay pedidos pendientes en el periodo', async () => {
    const { service } = escenario([]);
    await expect(service.liquidar(7, 1, 9, '2026-10-01', '2026-10-10')).rejects.toThrow(BadRequestException);
  });
});

describe('Editar y activar perfiles de distribuidor', () => {
  function perfil() {
    const original = { id: 7, empresaId: 2, codigo: 'D7', nombre: 'Distribuidor', zona: 'Centro', activo: true, porcentajeComision: 10 };
    const tx: any = {
      $executeRaw: jest.fn(),
      distribuidor: {
        findFirst: jest.fn(async ({ where }) => where.id === 7 ? original : null),
        update: jest.fn(async ({ data }) => ({ ...original, ...data })),
      },
      usuario: { findUnique: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditoria: { create: jest.fn() },
    };
    return { tx, service: new DistribuidoresService({ $transaction: fn => fn(tx) } as any) };
  }
  it('desactiva y reactiva tanto el perfil como su cuenta de acceso', async () => {
    const { service, tx } = perfil();
    await service.actualizar(7, { activo: false }, 2, 9);
    expect(tx.usuario.updateMany).toHaveBeenCalledWith({ where: { distribuidorId: 7, empresaId: 2 }, data: { activo: false } });
    await service.actualizar(7, { activo: true }, 2, 9);
    expect(tx.usuario.updateMany).toHaveBeenLastCalledWith({ where: { distribuidorId: 7, empresaId: 2 }, data: { activo: true } });
  });
  it('actualiza los datos del perfil y sincroniza el correo y nombre de acceso', async () => {
    const { service, tx } = perfil();
    await service.actualizar(7, { codigo: 'D8', nombre: 'Nuevo nombre', zona: 'Norte', porcentajeComision: 12, email: 'NUEVO@example.com' }, 2, 9);
    expect(tx.distribuidor.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { codigo: 'D8', nombre: 'Nuevo nombre', zona: 'Norte', porcentajeComision: 12 } });
    expect(tx.usuario.updateMany).toHaveBeenCalledWith({ where: { distribuidorId: 7, empresaId: 2 }, data: { nombre: 'Nuevo nombre', email: 'nuevo@example.com' } });
  });
  it('rechaza usar el correo de otra cuenta antes de modificar el perfil', async () => {
    const { service, tx } = perfil();
    tx.usuario.findUnique.mockResolvedValue({ distribuidorId: null, empresaId: 2 });
    await expect(service.actualizar(7, { email: 'admin@example.com' }, 2, 9)).rejects.toThrow('ese correo');
    expect(tx.distribuidor.update).not.toHaveBeenCalled();
  });
});
