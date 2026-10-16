import { costoHistoricoItem } from './costo-historico';
describe('Historical sale costs', () => {
  it('snapshots presentation quantities without recalculating after price edits', () => {
    const item = { producto: { costo: 2 }, cantidad: 3, factorUnidades: 6 };
    const snapshot = costoHistoricoItem(item);
    item.producto.costo = 5;
    expect(snapshot).toBe(36);
    expect(costoHistoricoItem(item)).toBe(90);
  });
  it('keeps missing costs distinct from configured zero', () => {
    expect(costoHistoricoItem({ producto: { costo: null }, cantidad: 1 })).toBeNull();
    expect(costoHistoricoItem({ producto: { costo: 0 }, cantidad: 1 })).toBe(0);
  });
  it('includes recipe exclusions, extras and item quantities', () => {
    expect(costoHistoricoItem({ producto: { ingredientes: [{ cantidad: 2, ingrediente: { nombre: 'Pan', costoUnitario: 10 } }, { cantidad: 1, ingrediente: { nombre: 'Salsa', costoUnitario: null } }] }, exclusiones: ['Salsa'], cantidad: 2, adicionales: [{ cantidad: 3, adicional: { ingredienteId: 1, cantidad: 0.5, ingrediente: { costoUnitario: 4 } } }] })).toBe(52);
  });
  it('includes combo component costs and refuses to invent extra costs', () => {
    expect(costoHistoricoItem({ producto: { esCombo: true }, cantidad: 2, componentes: [{ cantidad: 3, producto: { costo: 5 } }] })).toBe(30);
    expect(costoHistoricoItem({ producto: { costo: 5 }, cantidad: 1, adicionales: [{ cantidad: 1, adicional: {} }] })).toBeNull();
  });
});
