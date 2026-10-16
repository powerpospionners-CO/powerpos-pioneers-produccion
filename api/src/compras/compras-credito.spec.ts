import { ComprasService } from './compras.service';
import { Prisma } from '@prisma/client';

describe('Compras a crédito opcionales', () => {
  const original = process.env.ADMINISTRACION_HABILITADA;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMINISTRACION_HABILITADA;
    else process.env.ADMINISTRACION_HABILITADA = original;
  });
  const datos = {
    categoria: 'COMPRA_MERCANCIA' as const,
    descripcion: 'Mercancía recibida',
    condicionPago: 'CREDITO' as const,
    proveedorId: 8,
    documento: 'NIT-FACT1',
    vencimiento: '2026-11-15',
    items: [{ productoId: 7, cantidad: 2, costoUnitario: 100 }],
  };
  function escenario() {
    const tx: any = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      proveedor: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 8, nombre: 'Proveedor', documento: 'NIT' }),
      },
      cuentaAdministrativa: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      producto: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 7,
              nombre: 'Producto',
              stockActual: 10,
              costo: new Prisma.Decimal(100),
              presentaciones: [],
            },
          ]),
        update: jest.fn(),
      },
      movimientoInventario: { create: jest.fn() },
      compraGasto: { create: jest.fn().mockResolvedValue({ id: 42 }) },
      movimientoFinanciero: { create: jest.fn() },
      auditoria: { create: jest.fn() },
    };
    const prisma: any = {
      empresa: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ permisos: { administracion: true } }),
      },
      saldoInicialCuenta: {
        findUnique: jest.fn().mockResolvedValue({ desde: new Date(0) }),
      },
      sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    return { tx, service: new ComprasService(prisma) };
  }
  it('requiere activación sin cambiar el flujo de contado', async () => {
    delete process.env.ADMINISTRACION_HABILITADA;
    const { tx, service } = escenario();
    await expect(service.registrar(datos, 4, 7, 2)).rejects.toThrow(
      'no están habilitados',
    );
    expect(tx.compraGasto.create).not.toHaveBeenCalled();
  });
  it('recibe stock y registra obligación sin descontar dinero todavía', async () => {
    process.env.ADMINISTRACION_HABILITADA = 'true';
    const { tx, service } = escenario();
    await service.registrar(datos, 4, 7, 2);
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { stockActual: 12, costo: 100 },
    });
    expect(tx.cuentaAdministrativa.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        empresaId: 7,
        tipo: 'PAGAR',
        monto: 200,
        saldo: 200,
        compraGastoId: 42,
        categoria: 'COMPRA_MERCANCIA',
      }),
    });
    expect(tx.movimientoFinanciero.create).not.toHaveBeenCalled();
  });
  it('rechaza proveedores ajenos antes de recibir mercancía', async () => {
    process.env.ADMINISTRACION_HABILITADA = 'true';
    const { tx, service } = escenario();
    tx.proveedor.findFirst.mockResolvedValue(null);
    await expect(service.registrar(datos, 4, 7, 2)).rejects.toThrow(
      'esta empresa',
    );
    expect(tx.producto.update).not.toHaveBeenCalled();
  });
});
