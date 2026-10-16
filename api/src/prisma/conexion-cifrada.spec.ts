import { cifrarConexion, descifrarConexion } from './conexion-cifrada';

describe('Branch database credentials', () => {
  const anterior = process.env.SEDE_DATABASE_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.SEDE_DATABASE_ENCRYPTION_KEY = 'a'.repeat(64);
  });
  afterAll(() => {
    if (anterior === undefined) delete process.env.SEDE_DATABASE_ENCRYPTION_KEY;
    else process.env.SEDE_DATABASE_ENCRYPTION_KEY = anterior;
  });
  it('encrypts without exposing the URL and recovers it only for its branch', () => {
    const url = 'postgresql://operador:privada@db.example/sede_1';
    const encrypted = cifrarConexion(url, 1, 2);
    expect(encrypted).not.toContain(url);
    expect(descifrarConexion(encrypted, 1, 2)).toBe(url);
    expect(() => descifrarConexion(encrypted, 1, 3)).toThrow();
    expect(() => descifrarConexion(encrypted, 2, 2)).toThrow();
  });
  it('rejects altered ciphertext and a different master key', () => {
    const encrypted = cifrarConexion('postgresql://u:p@db.example/sede', 1, 1);
    const pieces = encrypted.split('.');
    pieces[3] = (pieces[3][0] === '0' ? '1' : '0') + pieces[3].slice(1);
    expect(() => descifrarConexion(pieces.join('.'), 1, 1)).toThrow();
    process.env.SEDE_DATABASE_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => descifrarConexion(encrypted, 1, 1)).toThrow();
  });
  it('requires a configured key and rejects malformed records', () => {
    expect(() => descifrarConexion('v1.invalid', 1, 1)).toThrow();
    delete process.env.SEDE_DATABASE_ENCRYPTION_KEY;
    expect(() =>
      cifrarConexion('postgresql://u:p@db.example/sede', 1, 1),
    ).toThrow();
  });
});
