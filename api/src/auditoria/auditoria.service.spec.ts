import { AuditoriaService } from './auditoria.service';
import { ActividadInterceptor } from './actividad.interceptor';
import { lastValueFrom, of, throwError } from 'rxjs';

describe('Auditoría aislada por empresa', () => {
  it('consulta únicamente la empresa de la sesión y pagina por cursor', async () => {
    const db: any = { control: { auditoria: { findMany: jest.fn().mockResolvedValue([]) } } };
    await new AuditoriaService(db).listarEmpresa(2, '15');
    expect(db.control.auditoria.findMany.mock.calls[0][0].where).toEqual({ empresaId: 2, entidad: 'ActividadSistema', id: { lt: 15 } });
  });
  it('registra identidad y resultado sin contraseñas, PIN ni tokens', async () => {
    const auditoria: any = { actividad: jest.fn().mockResolvedValue({}) };
    const interceptor = new ActividadInterceptor(auditoria);
    const req: any = { user: { id: 7, empresaId: 2, rol: 'CAJERO' }, route: { path: '/acceso-barras/desbloquear' }, method: 'POST', body: { codigo: '12345678', password: 'secreto', token: 'privado' }, headers: { authorization: 'Bearer secreto' } };
    const contexto: any = { getHandler: () => () => {}, switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 201 }) }) };
    expect(await lastValueFrom(interceptor.intercept(contexto, { handle: () => of({ token: 'otro-privado' }) }))).toEqual({ token: 'otro-privado' });
    expect(auditoria.actividad.mock.calls[0][0]).toEqual(req.user);
    expect(JSON.stringify(auditoria.actividad.mock.calls[0][1])).not.toMatch(/12345678|secreto|privado/);
    await expect(lastValueFrom(interceptor.intercept(contexto, { handle: () => throwError(() => new Error('fallo')) }))).rejects.toThrow('fallo');
    expect(auditoria.actividad.mock.calls[1][1].estado).toBe(500);
  });
});
