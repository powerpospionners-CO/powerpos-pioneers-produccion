import { codigoErrorOperacion } from './error-operacion';
describe('Diagnóstico sin datos privados', () => {
  it('conserva códigos de base incluso dentro de una causa', () => {
    expect(codigoErrorOperacion({ cause: { code: 'P2021', message: 'mysql://privado' } })).toBe('P2021');
    expect(codigoErrorOperacion({ errorCode: 'P1001' })).toBe('P1001');
  });
  it('no imprime valores arbitrarios ni se bloquea con causas circulares', () => {
    const error: any = { code: 'mysql://secreto' }; error.cause = error;
    expect(codigoErrorOperacion(error)).toBe('SIN_CODIGO');
    expect(codigoErrorOperacion(new Error('password privado'))).toBe('SIN_CODIGO');
  });
});
