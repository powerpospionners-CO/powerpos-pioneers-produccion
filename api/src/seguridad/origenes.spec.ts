import { origenPermitido } from './origenes';
describe('Orígenes de PowerPOS', () => {
  it('admite los portales HTTPS y los clientes nativos', () => {
    for (const o of [
      undefined,
      'https://powerpospioneers.com',
      'https://app.powerpospioneers.com',
      'https://trailerdelsabor.powerpospioneers.com',
    ])
      expect(origenPermitido(o)).toBe(true);
  });
  it('rechaza suplantación de dominio y conexiones inseguras', () => {
    for (const o of [
      'null',
      'http://app.powerpospioneers.com',
      'https://powerpospioneers.com.ejemplo.com',
      'https://falsopowerpospioneers.com',
      'https://app.powerpospioneers.com:9000',
      'http://localhost:3000',
    ])
      expect(origenPermitido(o)).toBe(false);
    expect(origenPermitido('http://localhost:3000', true)).toBe(true);
  });
});
