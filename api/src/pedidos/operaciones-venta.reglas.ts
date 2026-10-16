import { BadRequestException } from '@nestjs/common';
export const MEDIOS_COBRO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA'];
export function importesNetos(subtotales: number[], neto: number) {
  const suma = subtotales.reduce((s,n) => s+n,0);
  const centavos = Math.round(neto * 100);
  if (!Number.isSafeInteger(centavos) || centavos < 0 || subtotales.some(n=>!Number.isFinite(n)||n<0)) throw new BadRequestException('Importes no válidos');
  if (!suma) return subtotales.map(()=>0);
  const cuotas = subtotales.map(n=>n/suma*centavos);
  const resultado = cuotas.map(Math.floor);
  const orden = cuotas.map((n,i)=>({i,resto:n-resultado[i]})).sort((a,b)=>b.resto-a.resto);
  const faltantes = centavos - resultado.reduce((s,n)=>s+n,0);
  for(let i=0;i<faltantes;i++)resultado[orden[i % orden.length].i]++;
  return resultado.map(n=>n/100);
}
export function desgloseCobros(pedidos: { metodoPago: string; total: unknown; pagos?: { metodoPago: string; monto: unknown }[] }[], operaciones: { tipo: string; metodoPago: string; monto: unknown }[]) {
  const medios = new Map<string,number>();
  const sumar = (m:string,n:number)=>medios.set(m,(medios.get(m)||0)+n);
  for(const p of pedidos) {
    if(p.metodoPago==='CREDITO') continue;
    for(const pago of p.pagos?.length ? p.pagos : [{metodoPago:p.metodoPago,monto:p.total}]) sumar(pago.metodoPago,Number(pago.monto));
  }
  for(const op of operaciones) sumar(op.metodoPago,Number(op.monto)*(op.tipo==='DEVOLUCION'?-1:1));
  return [...medios].map(([metodo,total])=>({metodo,total:Math.round(total*100)/100}));
}
