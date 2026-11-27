import { ContactoSoporteService, validarContacto } from './contacto-soporte';

describe('Contacto de soporte', () => {
  it('valida el WhatsApp con indicativo y el correo', () => {
    expect(validarContacto({ whatsapp: '+57 300 123 4567', correo: ' Soporte@PowerPOS.co ', horario: 'Lunes a sábado' })).toEqual({ whatsapp: '573001234567', correo: 'soporte@powerpos.co', horario: 'Lunes a sábado' });
    expect(() => validarContacto({ whatsapp: '3001' })).toThrow('indicativo');
    expect(() => validarContacto({ correo: 'no-es-correo' })).toThrow('Correo');
    expect(validarContacto({})).toEqual({ whatsapp: '', correo: '', horario: '' });
  });
  it('solo el superadministrador lo cambia y se guarda en la base de control', async () => {
    const control: any = { $executeRawUnsafe: jest.fn(), ajusteRegistro: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue({ datos: { whatsapp: '573001234567' } }) } };
    const s = new ContactoSoporteService({ control } as any);
    await expect(s.guardar({ id: 2, rol: 'ADMIN_EMPRESA' }, { whatsapp: '573001234567' })).rejects.toThrow('superadministrador');
    await s.guardar({ id: 1, rol: 'SUPERADMIN' }, { whatsapp: '573001234567' });
    expect(control.ajusteRegistro.upsert.mock.calls[0][0].where).toEqual({ empresaId_sucursalId_clave: { empresaId: 0, sucursalId: 0, clave: 'contacto-soporte' } });
    expect(await s.obtener()).toEqual({ whatsapp: '573001234567', correo: '', horario: '' });
  });
});
