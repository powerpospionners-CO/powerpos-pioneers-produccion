import { validarDespliegue } from './despliegue';

describe('Configuración de despliegue', () => {
  it('impide varias instancias sin canal compartido y exige proxies explícitos', () => {
    expect(() => validarDespliegue({ WEB_CONCURRENCY: '2' })).toThrow(
      'EVENTOS_COMPARTIDOS',
    );
    expect(
      validarDespliegue({
        WEB_CONCURRENCY: '2',
        EVENTOS_COMPARTIDOS: 'true',
        TRUSTED_PROXIES: 'loopback,10.0.0.0/8',
      }),
    ).toEqual(['loopback', '10.0.0.0/8']);
    expect(() => validarDespliegue({ TRUSTED_PROXIES: 'true' })).toThrow();
  });
});
