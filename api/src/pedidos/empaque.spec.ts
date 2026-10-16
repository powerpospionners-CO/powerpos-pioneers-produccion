import { adicionalesConEmpaque } from './empaque';

describe('Empaque por unidad para llevar', () => {
  const empaque = { id: 7, activo: true, disponible: true, empaqueParaLlevar: true, ingredienteId: 22 };
  const producto = { adicionales: [{ adicional: empaque }], ingredientes: [{ ingredienteId: 21 }] };
  it('comer aquí no consume porta hamburguesa, conserva otros extras', () => {
    expect(adicionalesConEmpaque({ tipoConsumo: 'AQUI', adicionales: [{ adicionalId: 7, cantidad: 4 }, { adicionalId: 8, cantidad: 2 }] }, producto))
      .toEqual([{ adicionalId: 8, cantidad: 2 }]);
  });
  it('para llevar incluye exactamente uno por unidad, sin duplicarlo por reintentos del cliente', () => {
    expect(adicionalesConEmpaque({ tipoConsumo: 'PARA_LLEVAR', adicionales: [{ adicionalId: 7, cantidad: 8 }] }, producto))
      .toEqual([{ adicionalId: 7, cantidad: 1 }]);
  });
  it('no agrega empaques a productos sin asociación explícita', () => {
    expect(adicionalesConEmpaque({ tipoConsumo: 'PARA_LLEVAR' }, { adicionales: [] })).toEqual([]);
  });
  it('conserva compatibilidad con ventas de clientes anteriores', () => {
    expect(adicionalesConEmpaque({ adicionales: [{ adicionalId: 8, cantidad: 2 }] }, producto)).toEqual([{ adicionalId: 8, cantidad: 2 }]);
  });
  it('rechaza opciones inválidas, empaques no disponibles y consumo doble en receta', () => {
    expect(() => adicionalesConEmpaque({ tipoConsumo: 'OTRO' }, producto)).toThrow();
    expect(() => adicionalesConEmpaque({ tipoConsumo: 'PARA_LLEVAR' }, { adicionales: [{ adicional: { ...empaque, disponible: false } }] })).toThrow();
    expect(() => adicionalesConEmpaque({ tipoConsumo: 'PARA_LLEVAR' }, { ...producto, ingredientes: [{ ingredienteId: 22 }] })).toThrow();
  });
});
