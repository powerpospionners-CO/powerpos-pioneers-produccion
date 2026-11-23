import { randomBytes } from 'node:crypto';
import {
  cifrar,
  descifrar,
  fecha,
  centavos,
  validarPeriodo,
} from './personal.reglas';
describe('Expedientes privados laborales', () => {
  const anterior = process.env.PERSONAL_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.PERSONAL_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });
  afterAll(() => {
    if (anterior) process.env.PERSONAL_ENCRYPTION_KEY = anterior;
    else delete process.env.PERSONAL_ENCRYPTION_KEY;
  });
  it('cifra sin revelar datos y rechaza otra sede, versión o contenido alterado', () => {
    const original = {
        nombre: 'Persona privada',
        identificacion: '987654',
        salario: 2400000,
      },
      aad = '1:2:EMPLEADO:uuid:1',
      e = cifrar(original, aad);
    expect(JSON.stringify(e)).not.toContain('Persona privada');
    expect(descifrar(e, aad)).toEqual(original);
    expect(() => descifrar(e, '1:3:EMPLEADO:uuid:1')).toThrow();
    expect(() => descifrar(e, '1:2:EMPLEADO:uuid:2')).toThrow();
    expect(() =>
      descifrar(
        { ...e, contenido: Buffer.from('alterado').toString('base64') },
        aad,
      ),
    ).toThrow();
  });
  it('no permite registrar expedientes sin clave dedicada', () => {
    const key = process.env.PERSONAL_ENCRYPTION_KEY;
    delete process.env.PERSONAL_ENCRYPTION_KEY;
    expect(() => cifrar({}, 'x')).toThrow('clave privada');
    process.env.PERSONAL_ENCRYPTION_KEY = key;
  });
  it('rechaza fechas inexistentes e importes con exceso de precisión', () => {
    expect(() => fecha('2026-02-30')).toThrow();
    expect(() => centavos('100.001')).toThrow();
    expect(() => centavos('-1')).toThrow();
    expect(centavos('123.45')).toBe(12345);
  });
  it('exige fundamento y soporte para cada deducción y una revisión expresa', () => {
    const d = {
      desde: '2026-11-01',
      hasta: '2026-11-15',
      fechaProgramada: '2026-11-16',
      revisado: true,
      conceptos: [
        { tipo: 'DEVENGADO', nombre: 'Salario', monto: '1000' },
        { tipo: 'DEDUCCION', nombre: 'Deducción', monto: '50' },
      ],
    };
    expect(() => validarPeriodo(d)).toThrow();
    const revisado = {
      ...d,
      conceptos: [
        d.conceptos[0],
        {
          ...d.conceptos[1],
          fundamento: 'Autorización expresa',
          soporteId: 'archivo',
        },
      ],
    };
    expect(validarPeriodo(revisado).totalCentavos).toBe(95000);
    expect(() => validarPeriodo({ ...revisado, revisado: false })).toThrow();
  });
});
