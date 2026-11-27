import { CajaService } from './caja.service';

describe('Arqueo ciego', () => {
  function escenario(activo: boolean, recaudo = false) {
    const caja: any = {
      id: 1, usuarioId: 3, montoInicial: 100, estado: 'ABIERTA',
      usuario: { nombre: 'Caja' },
      sucursal: { nombre: 'Centro', baseEfectivoCaja: recaudo ? 100 : null, empresa: { recaudoEfectivoHabilitado: recaudo } },
      pedidos: [{ id: 5, usuarioId: 3, total: 200, metodoPago: 'EFECTIVO', estado: 'ENTREGADO', pagos: [] }],
    };
    const db: any = { caja: { findFirst: jest.fn().mockResolvedValue(caja) }, operacionVentaCaja: { findMany: jest.fn().mockResolvedValue([]) } };
    const ajustes: any = { leer: jest.fn().mockResolvedValue({ activo }), guardar: jest.fn(async (_e: number, _s: number, _c: string, d: any) => d) };
    return { s: new CajaService(db, {} as any, {} as any, undefined, ajustes), ajustes };
  }
  it('oculta al cajero lo esperado y las ventas, pero no al administrador', async () => {
    const { s } = escenario(true);
    const cajero: any = await s.obtenerCajaAbierta(2, 4, 'CAJERO');
    expect(cajero).toMatchObject({ arqueoCiego: true });
    expect(cajero.totalEsperado).toBeUndefined();
    expect(cajero.totalEfectivo).toBeUndefined();
    expect(cajero.pedidos).toBeUndefined();
    const admin: any = await s.obtenerCajaAbierta(2, 4, 'ADMIN_EMPRESA');
    expect(admin.totalEsperado).toBe(300);
  });
  it('no aplica con recaudo semanal ni si está desactivado', async () => {
    expect((await escenario(true, true).s.obtenerCajaAbierta(2, 4, 'CAJERO') as any).totalEfectivo).toBe(200);
    expect((await escenario(false).s.obtenerCajaAbierta(2, 4, 'CAJERO') as any).totalEsperado).toBe(300);
  });
  it('valida la configuración', async () => {
    const { s, ajustes } = escenario(false);
    await expect(s.configurarArqueoCiego(4, 2, 'si', 1)).rejects.toThrow('Indica');
    expect(await s.configurarArqueoCiego(4, 2, true, 1)).toEqual({ activo: true });
    expect(ajustes.guardar).toHaveBeenCalledWith(4, 2, 'arqueo-ciego', { activo: true }, 1);
  });
});
