import {
  cuentaNomina,
  cuentaResumida,
  empleadoDocumental,
  revisionCuenta,
  totalesNomina,
} from './nomina-bancaria';
import { PersonalService } from './personal.service';
describe('Cuenta de nómina y comprobante desglosado', () => {
  const cuenta = cuentaNomina({
    nombre: 'Trabajador ficticio',
    banco: 'Davivienda',
    tipoCuenta: 'AHORROS',
    numeroCuenta: '001234567890',
  });
  it('preserva ceros, valida los campos y mantiene cuentas al editar desde clientes anteriores', () => {
    expect(cuenta?.numero).toBe('001234567890');
    expect(cuentaNomina({ nombre: 'Trabajador ficticio' }, cuenta)).toEqual(
      cuenta,
    );
    expect(
      cuentaNomina({ banco: '', tipoCuenta: '', numeroCuenta: '' }, cuenta),
    ).toBeNull();
    expect(() =>
      cuentaNomina({
        nombre: 'X',
        banco: 'Davivienda',
        tipoCuenta: 'AHORROS',
        numeroCuenta: '123-abc',
      }),
    ).toThrow();
  });
  it('omite la cuenta completa de documentos y detecta cambios en el destino', () => {
    expect(cuentaResumida(cuenta)).toEqual({
      banco: 'Davivienda',
      tipo: 'AHORROS',
      titular: 'Trabajador ficticio',
      terminacion: '7890',
    });
    expect(
      empleadoDocumental({ nombre: 'Prueba', cuentaNomina: cuenta }),
    ).toEqual({ nombre: 'Prueba' });
    expect(revisionCuenta(cuenta)).not.toBe(
      revisionCuenta({ ...cuenta, numero: '009999999999' }),
    );
  });
  it('totaliza devengados y deducciones sin volver a restarlas del pago', () => {
    expect(
      totalesNomina([
        { tipo: 'DEVENGADO', montoCentavos: 100000 },
        { tipo: 'DEVENGADO', montoCentavos: 10000 },
        { tipo: 'DEDUCCION', montoCentavos: 4000 },
        { tipo: 'DEDUCCION', montoCentavos: 4000 },
      ]),
    ).toEqual({ devengado: 110000, deducido: 8000, neto: 102000 });
  });
  it('genera un PDF paginado con el detalle completo de un abono sin confirmar', async () => {
    const doc = {
      id: 'pago-prueba',
      tipo: 'PAGO',
      estado: 'REGISTRADO_SIN_CONFIRMAR',
      datos: {
        empresa: { nombre: 'Empresa ficticia', nit: '000' },
        empleado: { nombre: 'Trabajador ficticio', identificacion: '000' },
        desde: '2026-11-01',
        hasta: '2026-11-15',
        fechaPago: '2026-11-16',
        medio: 'TRANSFERENCIA',
        montoCentavos: 50000,
        netoPeriodoCentavos: 96000,
        pagadoAnteriorCentavos: 0,
        saldoTrasAbonoCentavos: 46000,
        documentoHash: 'hash-prueba',
        conceptos: [
          { tipo: 'DEVENGADO', nombre: 'Salario', montoCentavos: 100000 },
          {
            tipo: 'DEDUCCION',
            nombre: 'Salud',
            montoCentavos: 4000,
            fundamento: 'Aporte legal de prueba',
          },
        ],
        cuentaDestino: cuentaResumida(cuenta),
        referenciaTransferencia: 'referencia-ficticia',
      },
    };
    const service = new PersonalService(
      {
        obtener: jest.fn().mockResolvedValue(doc),
        listar: jest.fn().mockResolvedValue([]),
      } as any,
      undefined as any,
    );
    const r = await service.documento(
      { id: 1, empresaId: 1, sucursalId: 1 },
      doc.id,
    );
    expect(r.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.firmas).toEqual([]);
    expect(r.doc.estado).toBe('REGISTRADO_SIN_CONFIRMAR');
  });
});
