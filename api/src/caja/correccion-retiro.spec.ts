import { CajaService } from './caja.service';
import { CajaController } from './caja.controller';

describe('Corrección de retiro del recaudo', () => {
  function escenario() {
    const retiro = { id: 7, cajaId: 3, montoEsperado: 100, montoRetirado: 150, caja: { estado: 'CERRADA', montoInicial: 50, montoFinal: 50, diferencia: 50 } };
    const db: any = { $executeRaw: jest.fn(), retiroEfectivoCaja: { findFirst: jest.fn().mockResolvedValue(retiro), update: jest.fn() }, caja: { update: jest.fn() }, auditoria: { create: jest.fn() }, eventoCaja: { create: jest.fn() } };
    db.$transaction = jest.fn(fn => fn(db));
    return { db, servicio: new CajaService(db, {} as any, {} as any) };
  }
  it('solo autoriza al administrador en el endpoint', () => {
    expect(Reflect.getMetadata('roles', CajaController.prototype.corregirRetiro)).toEqual(['ADMIN_EMPRESA']);
  });
  it('corrige retiro y diferencia conservando conteo y esperado; audita motivo', async () => {
    const { db, servicio } = escenario();
    await servicio.corregirRetiroRecaudo(7, { montoRetirado: 100, montoAnterior: 150, motivo: 'Retiro mal digitado' }, 2, 4, 8);
    expect(db.retiroEfectivoCaja.findFirst).toHaveBeenCalledWith({ where: { id: 7, sucursalId: 2, empresaId: 4 }, include: { caja: true } });
    expect(db.retiroEfectivoCaja.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { montoRetirado: 100 } });
    expect(Number(db.caja.update.mock.calls[0][0].data.diferencia)).toBe(0);
    expect(Object.keys(db.caja.update.mock.calls[0][0].data)).toEqual(['diferencia']);
    expect(db.auditoria.create.mock.calls[0][0].data).toMatchObject({ empresaId: 4, usuarioId: 8, detalle: { motivo: 'Retiro mal digitado', anterior: { montoRetirado: 150 }, nuevo: { montoRetirado: 100 } } });
  });
  it('rechaza cambios concurrentes y registros fuera de la sede sin escrituras', async () => {
    const { db, servicio } = escenario();
    const datos = { montoRetirado: 100, montoAnterior: 140, motivo: 'Retiro mal digitado' };
    await expect(servicio.corregirRetiroRecaudo(7, datos, 2, 4, 8)).rejects.toThrow('El retiro cambió');
    db.retiroEfectivoCaja.findFirst.mockResolvedValue(null);
    await expect(servicio.corregirRetiroRecaudo(7, datos, 2, 4, 8)).rejects.toThrow('esta sede');
    expect(db.retiroEfectivoCaja.update).not.toHaveBeenCalled();
  });
  it.each([-1, 1.001, '', null, undefined, Infinity])('rechaza monto inválido %s', async monto => {
    const { db, servicio } = escenario();
    await expect(servicio.corregirRetiroRecaudo(7, { montoRetirado: monto, montoAnterior: 150, motivo: 'Retiro mal digitado' }, 2, 4, 8)).rejects.toThrow('Indica el retiro real');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
