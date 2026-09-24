import { jwtSecret } from './jwt-secret';

describe('Configuración JWT', () => {
  const anterior = process.env.JWT_SECRET;
  afterEach(() => {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  });
  it('impide arrancar sin una clave configurada', () => {
    delete process.env.JWT_SECRET;
    expect(jwtSecret).toThrow('JWT_SECRET es obligatorio');
    process.env.JWT_SECRET = '  ';
    expect(jwtSecret).toThrow();
  });
  it('conserva la clave configurada y las sesiones existentes', () => {
    process.env.JWT_SECRET = 'clave-configurada-para-prueba';
    expect(jwtSecret()).toBe('clave-configurada-para-prueba');
  });
});
