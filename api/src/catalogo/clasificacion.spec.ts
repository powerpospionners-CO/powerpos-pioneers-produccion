import { clasificarProducto } from './clasificacion';

describe('clasificarProducto', () => {
  it('detecta origen peruano por ingredientes andinos', () => {
    expect(clasificarProducto('AJI PANCA', '500 G', 'CONDIMENTO').origen).toBe('PERUANO');
    expect(clasificarProducto('CHULPI FRITO', null, null).origen).toBe('PERUANO');
    expect(clasificarProducto('SOBRE CHICHA', null, null).origen).toBe('PERUANO');
  });

  it('detecta origen mexicano por chiles y dulces', () => {
    expect(clasificarProducto('CHILE GUAJILLO', '250 G', null).origen).toBe('MEXICANO');
    expect(clasificarProducto('BANDERILLAS AZUCARADAS - TARRO 40 UNIDADES', '800 G', null).origen).toBe('MEXICANO');
  });

  it('deja sin origen cuando no hay señal o hay de ambos', () => {
    expect(clasificarProducto('SAL DEL HIMALAYA', '500 G', null).origen).toBeNull();
    expect(clasificarProducto('AJI PANCA CHILE GUAJILLO', null, null).origen).toBeNull();
  });

  it('asigna usos por tipo de producto', () => {
    expect(clasificarProducto('PIMIENTA POLVO', '100 G', null).usos).toContain('RESTAURANTE');
    expect(clasificarProducto('PULPARINDO CAJA GRANDE', null, null).usos).toContain('TIENDA');
  });

  it('marca mayorista en presentaciones de 1 kg o más', () => {
    expect(clasificarProducto('MAIZ MORADO', '1000 G', null).usos).toContain('MAYORISTA');
    expect(clasificarProducto('CHIA', '125 G', null).usos).not.toContain('MAYORISTA');
  });
});
