import { PersonalStore } from './personal.store';
describe('Ámbito de expedientes privados', () => {
  const store = new PersonalStore(undefined as any);
  it('no convierte una sede ausente en una consulta sin filtro', () => {
    expect(() =>
      store.scope({ id: 1, empresaId: 1, sucursalId: undefined as any }),
    ).toThrow('sede válida');
    expect(() => store.scope({ id: 1, empresaId: 0, sucursalId: 1 })).toThrow();
    expect(store.scope({ id: 1, empresaId: 2, sucursalId: 3 })).toEqual({
      empresaId: 2,
      sucursalId: 3,
    });
  });
});
