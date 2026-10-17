import { EmpaquesService, normalizarEmpaque } from './empaques.service';

describe('Bodega y empaque', () => {
  const solicitud = { ingredienteId: 1, items: [{ productoId: 2, unidades: 10, gramos: 30 }, { productoId: 3, unidades: 10, gramos: 125 }] };
  it('consume 1550 gramos para diez paquetes de 30 g y diez de 125 g', () => {
    expect(normalizarEmpaque(solicitud).totalGramos).toBe(1550);
    expect(normalizarEmpaque({ ...solicitud, mermaGramos: 50 }).totalGramos).toBe(1600);
  });
  it('suma decimales sin introducir errores de precisión', () => {
    expect(normalizarEmpaque({ ingredienteId: 1, items: [{ productoId: 2, unidades: 3, gramos: 0.1 }], mermaGramos: 0.2 }).totalGramos).toBe(0.5);
  });
  it('rechaza cantidades negativas, fracciones de paquete y destinos repetidos', () => {
    for (const items of [[{ productoId: 2, unidades: 1.5, gramos: 30 }], [{ productoId: 2, unidades: 1, gramos: -1 }], [{ productoId: 2, unidades: 1, gramos: 30 }, { productoId: 2, unidades: 2, gramos: 30 }]])
      expect(() => normalizarEmpaque({ ingredienteId: 1, items })).toThrow();
    expect(() => normalizarEmpaque({ ...solicitud, mermaGramos: -1 })).toThrow();
    expect(() => normalizarEmpaque({ ingredienteId: 1, items: [{ productoId: 2, unidades: 999999, gramos: 9999999 }] })).toThrow();
  });
  it('no repite movimientos cuando recupera una operación confirmada', async () => {
    const previa = { id: 55, detalle: {} as any };
    const tx: any = { $executeRaw: jest.fn(), auditoria: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(({ data }) => { previa.detalle = data.detalle; return previa; }) }, sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) }, ingrediente: { create: jest.fn().mockResolvedValue({ id: 3 }) }, movimientoInventario: { create: jest.fn() } };
    tx.ingrediente.findFirst = jest.fn().mockResolvedValue(null);
    const servicio = new EmpaquesService({ $transaction: (fn: any) => fn(tx) } as any);
    const datos = { clave: 'operacion-prueba-1234', nombre: 'Sal marina', gramos: 50000 };
    const actor = { id: 4, empresaId: 2, sucursalId: 1 };
    await servicio.crearMateria(datos, actor);
    tx.auditoria.findFirst.mockResolvedValue(previa);
    expect(await servicio.crearMateria(datos, actor)).toBe(previa);
    expect(tx.ingrediente.create).toHaveBeenCalledTimes(1);
    expect(tx.movimientoInventario.create).toHaveBeenCalledTimes(1);
    await expect(servicio.crearMateria({ ...datos, gramos: 60000 }, actor)).rejects.toThrow('otra operación');
  });
  it('no modifica existencias si no alcanza la materia prima', async () => {
    const tx: any = { $executeRaw: jest.fn(), $queryRaw: jest.fn(), auditoria: { findFirst: jest.fn().mockResolvedValue(null) }, sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) }, ingrediente: { findFirst: jest.fn().mockResolvedValue({ id: 1, stock: 100 }) }, producto: { update: jest.fn() } };
    const servicio = new EmpaquesService({ $transaction: (fn: any) => fn(tx) } as any);
    await expect(servicio.empacar({ ...solicitud, clave: 'empaque-prueba-1234' }, { id: 1, empresaId: 1, sucursalId: 1 })).rejects.toThrow('suficiente');
    expect(tx.producto.update).not.toHaveBeenCalled();
  });
});
