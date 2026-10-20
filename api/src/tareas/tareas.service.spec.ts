import { TareasService } from './tareas.service';

describe('Cumpleaños por sede', () => {
  const crear = () => {
    const reservas: any[] = [];
    const auditoria = {
      findFirst: jest.fn(async ({ where }) => reservas.find(r => r.empresaId === where.empresaId && r.entidad === where.entidad && r.entidadId === where.entidadId && r.detalle.fecha === where.detalle.equals)),
      create: jest.fn(async ({ data }) => { const r = { ...data, id: reservas.length + 1 }; reservas.push(r); return r; }),
      update: jest.fn(async () => ({})),
    };
    const db: any = {
      empresa: { findMany: jest.fn().mockResolvedValue([{ id: 2, nombre: 'Enchila', clientes: [
        { id: 1, nombre: 'Ana', email: 'ana@example.com', fechaNacimiento: new Date('2000-10-19T00:00:00Z') },
        { id: 2, nombre: 'Mañana', email: 'otro@example.com', fechaNacimiento: new Date('2000-10-20T00:00:00Z') },
        { id: 3, nombre: 'Sin correo', email: null, fechaNacimiento: new Date('2000-10-19T00:00:00Z') },
      ] }]) }, auditoria, $executeRaw: jest.fn(),
    };
    db.$transaction = jest.fn(trabajo => trabajo(db));
    const notificaciones: any = {
      configuracion: jest.fn().mockResolvedValue({ correoConfigurado: true, administradores: [
        { id: 4, nombre: 'Admin', email: 'admin@example.com', fechaNacimiento: '1990-10-19', cumpleanos: true },
        { id: 5, nombre: 'Desactivado', email: 'no@example.com', fechaNacimiento: '1990-10-19', cumpleanos: false },
      ] }),
      enviarFelicitacionCumpleanos: jest.fn().mockResolvedValue({ enviado: true }),
    };
    return { db, notificaciones, service: new TareasService(db, notificaciones) };
  };
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-20T02:00:00Z')); });
  afterEach(() => jest.useRealTimers());
  it('usa el día de Colombia, felicita al cliente desde su empresa y al admin desde PowerPOS', async () => {
    const { service, notificaciones, db } = crear();
    expect(await service.notificarCumpleanosDeHoy(2)).toEqual({ clientesNotificados: 1, administradoresNotificados: 1 });
    expect(db.empresa.findMany.mock.calls[0][0].where).toEqual({ activo: true, id: 2 });
    expect(notificaciones.enviarFelicitacionCumpleanos.mock.calls).toEqual([
      [expect.objectContaining({ nombre: 'Ana' }), 'Enchila', false],
      [expect.objectContaining({ nombre: 'Admin' }), 'PowerPOS', true],
    ]);
    await service.notificarCumpleanosDeHoy(2);
    expect(notificaciones.enviarFelicitacionCumpleanos).toHaveBeenCalledTimes(2);
  });
  it('no cuenta entregas fallidas ni reenvía automáticamente un intento incierto', async () => {
    const { service, notificaciones, db } = crear();
    notificaciones.enviarFelicitacionCumpleanos.mockResolvedValue({ enviado: false });
    expect(await service.notificarCumpleanosDeHoy(2)).toEqual({ clientesNotificados: 0, administradoresNotificados: 0 });
    expect(db.auditoria.update).toHaveBeenCalledWith(expect.objectContaining({ data: { accion: 'NO_CONFIRMADO' } }));
    await service.notificarCumpleanosDeHoy(2);
    expect(notificaciones.enviarFelicitacionCumpleanos).toHaveBeenCalledTimes(2);
  });
  it('no reserva ni envía cumpleaños mientras el correo no esté configurado', async () => {
    const { service, notificaciones, db } = crear();
    notificaciones.configuracion.mockResolvedValue({ correoConfigurado: false, administradores: [] });
    await service.notificarCumpleanosDeHoy(2);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(notificaciones.enviarFelicitacionCumpleanos).not.toHaveBeenCalled();
  });
});
