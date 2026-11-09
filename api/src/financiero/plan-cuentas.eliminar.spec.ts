import { PlanCuentasService } from './plan-cuentas.service';

function preparar() {
  const cuentas = new Map<string, any>();
  const bajas: any[] = [];
  let asignadas = 0;
  const tx: any = {
    $queryRaw: jest.fn(),
    auditoria: {
      findMany: jest.fn(async () => bajas),
      create: jest.fn(async ({ data }) => { if (data.accion === 'ELIMINAR') bajas.push(data); return data; }),
    },
    cuentaPuc: {
      createMany: jest.fn(async ({ data }) => { for (const c of data) if (!cuentas.has(c.codigo)) cuentas.set(c.codigo, { ...c, id: cuentas.size + 1, activo: true }); }),
      findMany: jest.fn(async () => [...cuentas.values()].map(c => ({ ...c, _count: { asignaciones: asignadas } }))),
      findUnique: jest.fn(async ({ where }) => { const c = cuentas.get(where.empresaId_codigo.codigo); return c?.empresaId === where.empresaId_codigo.empresaId ? c : null; }),
      count: jest.fn(async ({ where }) => [...cuentas.values()].filter(c => c.empresaId === where.empresaId && c.codigo.startsWith(where.codigo.startsWith) && c.codigo !== where.codigo.not).length),
      delete: jest.fn(async ({ where }) => cuentas.delete(where.empresaId_codigo.codigo)),
      upsert: jest.fn(),
    },
    asignacionPuc: { count: jest.fn(async () => asignadas) },
  };
  const servicio = new PlanCuentasService({ $transaction: fn => fn(tx) } as any);
  return { servicio, cuentas, tx, bajas, asignar: () => { asignadas = 1; } };
}

describe('Eliminar cuentas PUC', () => {
  it('una cuenta inicial eliminada sigue ausente después de varias recargas', async () => {
    const { servicio, tx } = preparar();
    await servicio.catalogo(2);
    await servicio.eliminar(2, 8, '510506');
    for (let i = 0; i < 2; i++) expect((await servicio.catalogo(2)).some(c => c.codigo === '510506')).toBe(false);
    expect(tx.cuentaPuc.delete).toHaveBeenCalledWith({ where: { empresaId_codigo: { empresaId: 2, codigo: '510506' } } });
    expect(tx.auditoria.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ empresaId: 2, usuarioId: 8, accion: 'ELIMINAR' }) }));
  });
  it('impide borrar cuentas con referencias, descendientes o uso automático', async () => {
    const { servicio, tx, asignar } = preparar();
    await servicio.catalogo(2);
    await expect(servicio.eliminar(2, 8, '5105')).rejects.toThrow('subcuentas');
    await expect(servicio.eliminar(2, 8, '4135')).rejects.toThrow('informes automáticos');
    asignar();
    await expect(servicio.eliminar(2, 8, '510506')).rejects.toThrow('registros clasificados');
    expect(tx.cuentaPuc.delete).not.toHaveBeenCalled();
  });
  it('rechaza una eliminación de otra empresa', async () => {
    const { servicio, tx } = preparar();
    await servicio.catalogo(2);
    await expect(servicio.eliminar(1, 8, '510506')).rejects.toThrow('no encontrada');
    expect(tx.cuentaPuc.delete).not.toHaveBeenCalled();
  });
  it('rechaza el código ocupado al crear una cuenta sin sobrescribirla', async () => {
    const { servicio, tx } = preparar();
    await servicio.catalogo(2);
    await expect(servicio.guardar(2, 8, { codigo: '510506', nombre: 'Otro sueldo', activo: true, crear: true })).rejects.toThrow('ya existe');
    expect(tx.cuentaPuc.upsert).not.toHaveBeenCalled();
  });
});
