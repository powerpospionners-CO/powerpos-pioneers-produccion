import {
  datosContrato,
  resolverTexto,
  revisionContrato,
} from './contrato-editor.reglas';
import { pdfContrato } from './contrato-editor.service';
export const ejemploContrato = {
  empleadoId: 'empleado',
  razonSocial: 'EMPLEADOR LEGAL FICTICIO',
  fechaCelebracion: '2026-11-23',
  tipo: 'INDEFINIDO',
  inicio: '2026-11-23',
  domicilioEmpleado: 'Pereira, domicilio ficticio',
  domicilioEmpresa: 'Pereira, domicilio de prueba',
  lugarCelebracion: 'Pereira',
  lugarContratacion: 'Pereira',
  lugarServicio: 'Sede de prueba',
  cargo: 'Auxiliar',
  funciones: 'Atender clientes y organizar los productos.',
  salario: '2000000',
  frecuencia: 'QUINCENAL',
  formaPago: 'Transferencia a la cuenta autorizada por el trabajador.',
  jornada: 'Horario y jornada revisados por el responsable laboral.',
  descansos: 'Descansos legales y turnos acordados.',
  especieMonto: '0',
  terminacion: 'Causales, procedimientos y preavisos legales aplicables.',
  clausulas: [
    {
      titulo: 'Información de las partes',
      contenido: 'Trabajador: {{empleado}}. Empleador: {{empresa}}.',
    },
  ],
  anexos: [
    {
      titulo: 'Funciones detalladas',
      contenido: 'Relación de funciones de prueba.',
    },
  ],
};
describe('Editor de contratos', () => {
  it('exige los contenidos básicos y condiciones por modalidad', () => {
    expect(() =>
      datosContrato({ ...ejemploContrato, domicilioEmpleado: '' }),
    ).toThrow();
    expect(() => datosContrato({ ...ejemploContrato, tipo: 'FIJO' })).toThrow();
    expect(() =>
      datosContrato({ ...ejemploContrato, tipo: 'OBRA_LABOR' }),
    ).toThrow();
    expect(() =>
      datosContrato({
        ...ejemploContrato,
        especieMonto: '50000',
        especieDetalle: '',
      }),
    ).toThrow();
    expect(() =>
      datosContrato({
        ...ejemploContrato,
        especieMonto: '1500000',
        especieDetalle: 'Concepto de prueba',
      }),
    ).toThrow('50 %');
    expect(() =>
      datosContrato({ ...ejemploContrato, fechaCelebracion: '2999-01-01' }),
    ).toThrow();
    expect(datosContrato(ejemploContrato).salarioCentavos).toBe(200000000);
  });
  it('solo sustituye variables conocidas sin ejecutar instrucciones', () => {
    const d = {
      ...datosContrato(ejemploContrato),
      empresa: { nombre: 'Empresa de prueba', nit: '123' },
      empleado: { nombre: 'Ana de prueba', identificacion: '456' },
    };
    expect(resolverTexto('{{empleado}} / {{empresa}}', d)).toBe(
      'Ana de prueba / EMPLEADOR LEGAL FICTICIO',
    );
    expect(() => resolverTexto('{{constructor}}', d)).toThrow();
    expect(() => resolverTexto('{{empleado', d)).toThrow();
  });
  it('no registra una revisión tácita o con fecha futura', () => {
    expect(() => revisionContrato({ acepta: false })).toThrow();
    expect(() =>
      revisionContrato({ acepta: true, revisadaEn: '2999-01-01' }),
    ).toThrow();
  });
  it('produce un PDF real con anexos y paginación sin páginas de pie vacías', async () => {
    const d = {
      ...datosContrato(ejemploContrato),
      empresa: { nombre: 'Empresa ficticia de prueba', nit: '123' },
      empleado: { nombre: 'Ana de prueba', identificacion: '456' },
      fechaElaboracion: '2026-11-23',
    };
    const pdf = await pdfContrato(d, 'referencia-prueba', 1, true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
    expect(
      (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length,
    ).toBeGreaterThanOrEqual(2);
  });
});
