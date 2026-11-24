import {
  claveCargo,
  GUIAS_CARGOS,
  validarCargoPlantilla,
} from './perfiles-cargo';
describe('Perfiles laborales por cargo', () => {
  it('reconoce diferencias de mayúsculas, espacios y acentos sin confundir cargos distintos', () => {
    expect(claveCargo('  AUXILIAR  DE PRODUCCIÓN ')).toBe(
      claveCargo('auxiliar de produccion'),
    );
    expect(claveCargo('Cajera')).not.toBe(
      claveCargo('Auxiliar de ventas externas'),
    );
  });
  it('bloquea una plantilla de caja para ventas o producción incluso con confirmación de plantilla general', () => {
    for (const cargo of [
      'Auxiliar de ventas externas',
      'Auxiliar de producción de totopos y tortillas',
    ])
      expect(() =>
        validarCargoPlantilla(
          { perfilCargo: 'Cajera' },
          { cargo },
          { confirmarPerfilGeneral: true },
        ),
      ).toThrow('otro cargo');
  });
  it('exige revisión expresa para modelos anteriores sin perfil y permite coincidencias de cargo', () => {
    expect(() => validarCargoPlantilla({}, { cargo: 'Auxiliar' }, {})).toThrow(
      'antigua',
    );
    expect(() =>
      validarCargoPlantilla(
        {},
        { cargo: 'Auxiliar' },
        { confirmarPerfilGeneral: true },
      ),
    ).not.toThrow();
    expect(() =>
      validarCargoPlantilla(
        { perfilCargo: 'Auxiliar de producción' },
        { cargo: 'AUXILIAR DE PRODUCCION' },
        {},
      ),
    ).not.toThrow();
  });
  it('ofrece funciones diferenciadas sin fijar horarios, salarios ni comisiones', () => {
    expect(GUIAS_CARGOS).toHaveLength(3);
    expect(GUIAS_CARGOS[1].funciones).toContain('Visitar empresas');
    expect(GUIAS_CARGOS[2].funciones).toContain('totopos y tortillas');
    for (const g of GUIAS_CARGOS) {
      expect(g).not.toHaveProperty('jornada');
      expect(g).not.toHaveProperty('salario');
    }
  });
});
