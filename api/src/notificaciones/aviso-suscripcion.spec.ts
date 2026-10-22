import { avisoSuscripcion } from './aviso-suscripcion';
import { NotificacionesService } from './notificaciones.service';
import { correoSuscripcion } from './correo-powerpos';

describe('Recordatorios de suscripción', () => {
  const vence = new Date('2026-10-25T05:00:00Z');
  it('avisa dos días antes de vencer y dos antes del fin de los cinco días', () => {
    expect(avisoSuscripcion(vence, new Date('2026-10-23T13:00:00Z'))?.etapa).toBe('VENCIMIENTO');
    expect(avisoSuscripcion(vence, new Date('2026-10-28T13:00:00Z'))).toMatchObject({ etapa: 'FIN_PLAZO', dias: 2, finPlazo: new Date('2026-10-30T05:00:00Z') });
    for (const dia of [22, 25, 26, 27, 30, 31])
      expect(avisoSuscripcion(vence, new Date(`2026-10-${dia}T13:00:00Z`))).toBeNull();
  });
  it('usa el día colombiano aunque UTC ya marque el siguiente', () => {
    expect(avisoSuscripcion(vence, new Date('2026-10-23T04:59:59Z'))).toBeNull();
    expect(avisoSuscripcion(vence, new Date('2026-10-23T05:00:00Z'))?.dias).toBe(2);
    expect(avisoSuscripcion(null)).toBeNull();
    expect(avisoSuscripcion(new Date('invalida'))).toBeNull();
  });
  it('conserva marca, fechas, escape HTML y advertencia del plazo en el correo', () => {
    const correo = correoSuscripcion({ ...avisoSuscripcion(vence, new Date('2026-10-28T13:00:00Z'))!, empresa: '<Empresa>' });
    expect(correo.html).toContain('cid:marca@powerpospioneers.com');
    expect(correo.html).toContain('&lt;Empresa&gt;');
    expect(correo.text).toContain('Faltan 2 día(s)');
    expect(correo.text).toContain('suspensión');
  });
  function crear() {
    const entregados = new Set<string>();
    const central: any = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ id: 1, nombre: 'Empresa', activo: true, pagoExonerado: false, suscripcionVenceEn: vence }) },
      auditoria: {
        findFirst: jest.fn().mockImplementation(({ where }) => entregados.has(where.accion) ? { id: 1 } : null),
        create: jest.fn().mockImplementation(({ data }) => { entregados.add(data.accion); return { id: 1 }; }),
      },
    };
    const db: any = { control: central, empresa: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) } };
    const servicio = new NotificacionesService(db);
    const enviar = jest.fn().mockResolvedValue(undefined);
    (servicio as any).enviarEmail = enviar;
    jest.spyOn(servicio, 'configuracion').mockResolvedValue({ administradores: [{ email: 'a@example.com' }, { email: 'a@example.com' }, { email: 'b@example.com' }, { email: '' }] } as any);
    return { servicio, central, enviar };
  }
  it('envía individualmente y no repite por sede o revisión; la renovación habilita otro ciclo', async () => {
    const { servicio, central, enviar } = crear();
    const hoy = new Date('2026-10-23T13:00:00Z');
    await servicio.revisarSuscripcionesSede(hoy);
    await servicio.revisarSuscripcionesSede(hoy);
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls.map(c => c[2])).toEqual([['a@example.com'], ['b@example.com']]);
    central.empresa.findUnique.mockResolvedValue({ id: 1, nombre: 'Empresa', activo: true, pagoExonerado: false, suscripcionVenceEn: new Date('2026-11-25T05:00:00Z') });
    await servicio.revisarSuscripcionesSede(new Date('2026-11-23T13:00:00Z'));
    expect(enviar).toHaveBeenCalledTimes(4);
  });
  it('no marca como entregado el correo fallido y reintenta solo el pendiente', async () => {
    const { servicio, central, enviar } = crear();
    enviar.mockRejectedValueOnce(new Error('SMTP temporal'));
    await servicio.revisarSuscripcionesSede(new Date('2026-10-23T13:00:00Z'));
    expect(central.auditoria.create).toHaveBeenCalledTimes(1);
    await servicio.revisarSuscripcionesSede(new Date('2026-10-23T14:00:00Z'));
    expect(enviar).toHaveBeenCalledTimes(3);
  });
  it('no envía a empresas exoneradas, inactivas o sin vencimiento', async () => {
    const { servicio, central, enviar } = crear();
    for (const valores of [{ pagoExonerado: true }, { activo: false }, { suscripcionVenceEn: null }]) {
      central.empresa.findUnique.mockResolvedValue({ id: 1, nombre: 'Empresa', activo: true, pagoExonerado: false, suscripcionVenceEn: vence, ...valores });
      await servicio.revisarSuscripcionesSede(new Date('2026-10-23T13:00:00Z'));
    }
    expect(enviar).not.toHaveBeenCalled();
  });
});
