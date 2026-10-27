import { BadRequestException } from '@nestjs/common';

// Distribuye el flete proporcionalmente al valor comprado; los centavos del
// acumulado garantizan que la suma coincida exactamente con la factura.
export function distribuirEnvio(items: { cantidad: number; costoUnitario: number }[], envioInput: unknown = 0) {
  const envio = Number(envioInput);
  if (!Number.isFinite(envio) || envio < 0 || envio > 99999999.99 || Math.abs(envio * 100 - Math.round(envio * 100)) > 0.00001) throw new BadRequestException('El envío debe ser un valor no negativo con máximo dos decimales.');
  const subtotales = items.map(i => Math.round(Number(i.cantidad) * (Math.round(Number(i.costoUnitario)*100)/100) * 100));
  if (subtotales.some(n=>!Number.isFinite(n)||n<=0)) throw new BadRequestException('Revisa las cantidades y costos de la compra.');
  const total = subtotales.reduce((s,n)=>s+n,0);
  let acumulado = 0, asignado = 0;
  return subtotales.map(n => { acumulado += n; const siguiente = Math.round(Math.round(envio*100)*acumulado/total); const parte = siguiente-asignado; asignado=siguiente; return parte/100; });
}
