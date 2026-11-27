import { CampanasService, filtrarSegmento, validarCampana } from './campanas.service';
import { correoCampana } from '../notificaciones/correo-powerpos';

const DIA = 86400000;

describe('Reglas de campañas', () => {
  it('filtra por segmento y exige correo', () => {
    const ahora = Date.now();
    const s = [
      { creadoEn: new Date(ahora - 5 * DIA), correo: 'a@x.co' },
      { creadoEn: new Date(ahora - 60 * DIA), correo: 'b@x.co' },
      { creadoEn: new Date(ahora - 1 * DIA), correo: '' },
    ];
    expect(filtrarSegmento(s, 'TODOS', 30, ahora).map((x) => x.correo)).toEqual(['a@x.co', 'b@x.co']);
    expect(filtrarSegmento(s, 'NUEVOS', 30, ahora).map((x) => x.correo)).toEqual(['a@x.co']);
    expect(filtrarSegmento(s, 'ANTIGUOS', 30, ahora).map((x) => x.correo)).toEqual(['b@x.co']);
    expect(() => validarCampana({ dias: 0 })).toThrow('días');
  });
  it('el correo lleva botón a la tienda, el cupón y el enlace para darse de baja', () => {
    const c = correoCampana({ empresa: 'Enchila', asunto: 'Te extrañamos', mensaje: 'Vuelve <pronto>', cupon: { codigo: 'VUELVE10', descripcion: '10 %' }, enlaceTienda: 'https://app.powerpospioneers.com/tienda/enchila', enlaceBaja: 'https://app.powerpospioneers.com/tienda/enchila?baja=a%40x.co#boletin' });
    expect(c.html).toContain('href="https://app.powerpospioneers.com/tienda/enchila"');
    expect(c.html).toContain('Darme de baja');
    expect(c.html).toContain('VUELVE10');
    expect(c.html).toContain('Vuelve &lt;pronto&gt;');
    expect(c.text).toContain('Darme de baja: https://');
  });
});

describe('Servicio de campañas', () => {
  function escenario(opciones: { ultimaHace?: number; smtp?: boolean } = {}) {
    const ahora = Date.now();
    const suscriptores = [
      { id: 's1', creadoEn: new Date(ahora - 2 * DIA), datos: { nombre: 'Ana Pérez', correo: 'ana@x.co' } },
      { id: 's2', creadoEn: new Date(ahora - 90 * DIA), datos: { nombre: 'Beto', correo: 'ANA@x.co' } },
      { id: 's3', creadoEn: new Date(ahora - 90 * DIA), datos: { nombre: 'Caro', correo: 'caro@x.co' } },
      { id: 's4', creadoEn: new Date(ahora - 3 * DIA), datos: { nombre: 'Solo WhatsApp', whatsapp: '573001112233' } },
    ];
    const campanas: any[] = opciones.ultimaHace !== undefined ? [{ id: 'c0', creadoEn: new Date(ahora - opciones.ultimaHace * 3600000), datos: {} }] : [];
    const registros: any = {
      listar: jest.fn(async (_e: number, tipo: string) => (tipo === 'SUSCRIPTOR' ? suscriptores : tipo === 'CAMPANA' ? campanas : [{ datos: { codigo: 'VUELVE10', descripcion: '10 %', activo: true } }])),
      abrir: (r: any) => r.datos,
      buscar: jest.fn(async (_e: number, _t: string, clave: string) => (clave === 'VUELVE10' ? { datos: { codigo: 'VUELVE10', descripcion: '10 %', activo: true } } : null)),
      preparar: jest.fn(),
      crear: jest.fn(async (_e: number, _t: string, _c: string, datos: any) => { const r = { id: 'c1', datos }; campanas.unshift({ ...r, creadoEn: new Date() }); return r; }),
      actualizar: jest.fn(),
    };
    const notificaciones: any = { correoDisponible: () => opciones.smtp !== false, enviarCampana: jest.fn(async (correo: string) => correo !== 'caro@x.co') };
    const prisma: any = { empresa: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Enchila', tiendaSlug: 'enchila' }) } };
    return { s: new CampanasService(prisma, registros, notificaciones), registros, notificaciones };
  }
  const admin = { id: 1, rol: 'ADMIN_EMPRESA', empresaId: 4 };

  it('envía una vez por correo, con baja y cupón, y registra el resultado', async () => {
    const { s, notificaciones, registros } = escenario();
    expect(await s.vistaPrevia(admin, { segmento: 'TODOS' })).toMatchObject({ destinatarios: 2 });
    const r = await s.enviar(admin, { segmento: 'TODOS', asunto: 'Te extrañamos en {empresa}', mensaje: 'Hola {nombre}, vuelve pronto', cupon: 'vuelve10' });
    expect(r).toEqual({ enviados: 1, fallidos: 1, destinatarios: 2 });
    const [correo, datos] = notificaciones.enviarCampana.mock.calls[0];
    expect(correo).toBe('ana@x.co');
    expect(datos).toMatchObject({ asunto: 'Te extrañamos en Enchila', mensaje: 'Hola Ana, vuelve pronto', cupon: { codigo: 'VUELVE10' }, enlaceBaja: 'https://app.powerpospioneers.com/tienda/enchila?baja=ana%40x.co#boletin' });
    expect(registros.actualizar.mock.calls[0][1].datos).toMatchObject({ enviados: 1, fallidos: 1, estado: 'ENVIADA' });
  });

  it('valida permisos, correo, textos, cupón y la espera entre campañas', async () => {
    await expect(escenario().s.enviar({ ...admin, rol: 'GERENTE' }, {})).rejects.toThrow('administrador');
    await expect(escenario({ smtp: false }).s.enviar(admin, {})).rejects.toThrow('correo');
    await expect(escenario().s.enviar(admin, { asunto: 'Hola', mensaje: 'Mensaje largo de prueba' })).rejects.toThrow('asunto');
    await expect(escenario().s.enviar(admin, { asunto: 'Promoción', mensaje: 'Mensaje largo de prueba', cupon: 'NOEXISTE' })).rejects.toThrow('cupón');
    await expect(escenario({ ultimaHace: 3 }).s.enviar(admin, { asunto: 'Promoción', mensaje: 'Mensaje largo de prueba' })).rejects.toThrow('12 horas');
    await expect(escenario().s.enviar(admin, { segmento: 'NUEVOS', dias: 1, asunto: 'Promoción', mensaje: 'Mensaje largo de prueba' })).rejects.toThrow('No hay suscriptores');
  });
});
