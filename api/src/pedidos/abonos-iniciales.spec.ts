import { normalizarAbonosIniciales } from './calculos-venta';
describe('Abono inicial con saldo a crédito',()=>{
  it('acepta el caso 172.000 menos Nequi 31.400 y efectivo 90.600',()=>{
    const pagos=normalizarAbonosIniciales({pagos:[{metodoPago:'NEQUI',monto:31400},{metodoPago:'EFECTIVO',monto:90600}]},172000);
    expect(172000-pagos.reduce((s,p)=>s+p.monto,0)).toBe(50000);
  });
  it.each([null,{},[{metodoPago:'NEQUI',monto:172000}],[{metodoPago:'EFECTIVO',monto:172001}],[{metodoPago:'CREDITO',monto:50000}],[{metodoPago:'NEQUI',monto:-1}],[{metodoPago:'NEQUI',monto:0.001}]])('rechaza pagos inválidos o sin saldo pendiente: %p',pagos=>{
    expect(()=>normalizarAbonosIniciales({pagos},172000)).toThrow();
  });
  it('conserva la venta completamente a crédito sin inventar abonos',()=>expect(normalizarAbonosIniciales({},172000)).toEqual([]));
});
