import { distribuirEnvio } from './distribuir-envio';
describe('Envío de compras con IVA incluido',()=>{
  it('reparte por valor y no aplica otra vez IVA ni la ganancia de venta',()=>{
    expect(distribuirEnvio([{cantidad:2,costoUnitario:10000},{cantidad:1,costoUnitario:30000}],5000)).toEqual([2000,3000]);
  });
  it('no pierde centavos y rechaza envío negativo o no numérico',()=>{
    expect(distribuirEnvio([{cantidad:1,costoUnitario:1},{cantidad:1,costoUnitario:1},{cantidad:1,costoUnitario:1}],0.01)).toEqual([0,0.01,0]);
    expect(()=>distribuirEnvio([], -1)).toThrow();expect(()=>distribuirEnvio([], 'no')).toThrow();
  });
});
