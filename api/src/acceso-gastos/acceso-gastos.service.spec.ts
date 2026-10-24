import { AccesoGastosService } from './acceso-gastos.service';
import { AccesoGastosController } from './acceso-gastos.controller';
import { AccesoTemporal } from '../auth/acceso-temporal';
import { RolesGuard } from '../auth/roles.guard';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';

describe('Registro restringido de gastos', () => {
  const usuario = { id: 10, empresaId: 2, sucursalId: 2 };
  const formulario = () => ({ categoria: 'OTROS', descripcion: 'Transporte de mercancía', monto: 10000, fecha: '2026-01-01', pagadoConRecaudo: true, clave: randomUUID() });
  it('rechaza campos que intenten modificar empresa, responsable, tipo o mercancía', async () => {
    const financiero: any = { registrarMovimiento: jest.fn() };
    const servicio = new AccesoGastosService({} as any, financiero);
    jest.spyOn(servicio, 'verificar').mockResolvedValue(undefined);
    for (const extra of [{ empresaId: 3 }, { usuarioId: 3 }, { tipo: 'INGRESO' }, { items: [] }, { categoria: 'COMPRA_MERCANCIA' }, { monto: 0 }, { fecha: '2099-01-01' }]) {
      await expect(servicio.registrar(usuario, 'token', { ...formulario(), ...extra })).rejects.toThrow();
    }
    expect(financiero.registrarMovimiento).not.toHaveBeenCalled();
  });
  it('usa exclusivamente la empresa, sede y usuario autenticados para crear el egreso', async () => {
    const db: any = { $queryRaw: jest.fn().mockResolvedValue([{ id: 10 }]), auditoria: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) } };
    db.$transaction = jest.fn(fn => fn(db));
    const financiero: any = { registrarMovimiento: jest.fn().mockResolvedValue({ id: 9 }) };
    const servicio = new AccesoGastosService(db, financiero);
    jest.spyOn(servicio, 'verificar').mockResolvedValue(undefined);
    const gasto = await servicio.registrar(usuario, 'token', formulario());
    expect(gasto.id).toBe(9);
    expect(financiero.registrarMovimiento).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'EGRESO', pagadoConRecaudo: true }), 10, 2, 2, db);
    expect(db.auditoria.create.mock.calls[0][0].data).toMatchObject({ empresaId: 2, usuarioId: 10, entidadId: 9 });
  });
  it('mantiene los códigos, intentos y sesiones separados de códigos de barras', async () => {
    const db: any = { auditoria: { findFirst: jest.fn().mockResolvedValue(null) } };
    await new AccesoTemporal(db, 'AccesoGastos', 'financiero').estado(usuario);
    expect(db.auditoria.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { empresaId: 2, entidad: 'AccesoGastosConfiguracion', entidadId: 10 } }));
  });
  it('el cajero no puede otorgarse autorización a sí mismo', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx: any = { getHandler: () => AccesoGastosController.prototype.configurar, getClass: () => AccesoGastosController, switchToHttp: () => ({ getRequest: () => ({ user: { rol: 'CAJERO' } }) }) };
    expect(() => guard.canActivate(ctx)).toThrow();
  });
});
