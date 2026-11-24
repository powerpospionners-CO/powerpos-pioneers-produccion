import {
  baseModalidad,
  completarContrato,
  condicionesPlantilla,
} from './contratos-modalidades';
import { datosContrato } from './contrato-editor.reglas';
import { hoy } from './personal.reglas';
const perfil = {
  perfilCargo: 'Auxiliar',
  razonSocial: 'Empresa legal ficticia',
  domicilioEmpresa: 'Pereira',
  lugarCelebracion: 'Pereira',
  lugarContratacion: 'Pereira',
  lugarServicio: 'Sede ficticia',
  formaPago: 'Transferencia quincenal, días 15 y último día del mes.',
  jornada: '42 horas semanales según distribución revisada.',
  descansos: 'Descansos libres de funciones, con relevo.',
  funciones: 'Atención y caja con medidas de seguridad.',
};
const empleado = {
  nombre: 'Empleado ficticio',
  identificacion: '123-prueba',
  email: 'test@example.com',
  activo: true,
  ingreso: hoy(),
  domicilio: 'Domicilio ficticio del trabajador',
  cargo: 'Auxiliar',
  salarioCentavos: 175090500,
  frecuencia: 'QUINCENAL',
};
describe('Contratos digitales por modalidad', () => {
  it.each(['INDEFINIDO', 'FIJO', 'OBRA_LABOR'])(
    'completa %s con las condiciones de empresa y el expediente real',
    (tipo) => {
      const plantilla = condicionesPlantilla({ ...perfil, tipo });
      const d = completarContrato(plantilla, empleado, {
        empleadoId: 'id-prueba',
        fin: hoy(),
        obra: 'Organizar el inventario de la apertura del nuevo local hasta su entrega documentada.',
        salario: '999999',
        nombre: 'Nombre inyectado',
      });
      const datos = datosContrato(d);
      expect(datos.salarioCentavos).toBe(empleado.salarioCentavos);
      expect(datos.inicio).toBe(empleado.ingreso);
      expect(datos.cargo).toBe(empleado.cargo);
      expect(datos.clausulas.length).toBeGreaterThan(5);
      expect(datos.fechaCelebracion).toBe(hoy());
      expect(datos.tipo).toBe(tipo);
    },
  );
  it('exige fecha final o actividad precisa según modalidad y limita término fijo', () => {
    expect(() =>
      completarContrato({ ...perfil, ...baseModalidad('FIJO') }, empleado, {}),
    ).toThrow();
    expect(() =>
      completarContrato({ ...perfil, ...baseModalidad('FIJO') }, empleado, {
        fin: '2099-01-01',
      }),
    ).toThrow('cuatro años');
    expect(() =>
      completarContrato(
        { ...perfil, ...baseModalidad('OBRA_LABOR') },
        empleado,
        { obra: 'Cajero' },
      ),
    ).toThrow('precisa');
  });
  it('no convierte automáticamente una relación previa a fijo u obra ni reactiva retirados', () => {
    for (const tipo of ['FIJO', 'OBRA_LABOR'])
      expect(() =>
        completarContrato(
          baseModalidad(tipo),
          { ...empleado, ingreso: '2020-01-01' },
          {},
        ),
      ).toThrow('ya iniciada');
    expect(() =>
      completarContrato(
        baseModalidad('INDEFINIDO'),
        { ...empleado, activo: false },
        {},
      ),
    ).toThrow('retirado');
  });
  it('pide completar domicilio y condiciones, sin guardar empleados ficticios en la plantilla', () => {
    expect(() =>
      completarContrato(
        condicionesPlantilla({ ...perfil, tipo: 'INDEFINIDO' }),
        { ...empleado, domicilio: '' },
        {},
      ),
    ).toThrow('domicilio');
    expect(() =>
      condicionesPlantilla({
        ...perfil,
        tipo: 'INDEFINIDO',
        jornada: '[PENDIENTE]',
      }),
    ).toThrow('pendientes');
    expect(
      condicionesPlantilla({ ...perfil, tipo: 'INDEFINIDO' }),
    ).not.toHaveProperty('empleadoId');
  });
});
