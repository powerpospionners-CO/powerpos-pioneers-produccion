import { BadRequestException } from '@nestjs/common';

/** Only explicitly linked packaging applies; the general extras catalog never supplies packaging. */
export function adicionalesConEmpaque(item: any, producto: any): any[] {
  const solicitudes = Array.isArray(item.adicionales) ? item.adicionales : [];
  if (item.tipoConsumo === undefined) return solicitudes; // Older clients retain their existing behavior.
  if (!['AQUI', 'PARA_LLEVAR'].includes(item.tipoConsumo))
    throw new BadRequestException('Selecciona Comer aquí o Para llevar');
  const empaques = (producto.adicionales || []).map((p: any) => p.adicional)
    .filter((a: any) => a.activo && a.empaqueParaLlevar);
  const ids = new Set(empaques.map((a: any) => a.id));
  const normales = solicitudes.filter((s: any) => !ids.has(s.adicionalId));
  if (item.tipoConsumo === 'AQUI') return normales;
  for (const empaque of empaques) {
    if (!empaque.disponible) throw new BadRequestException(`El empaque ${empaque.nombre} no está disponible`);
    if ((producto.ingredientes || []).some((pi: any) => pi.ingredienteId === empaque.ingredienteId))
      throw new BadRequestException('Retira el empaque para llevar de la receta base para evitar descontarlo dos veces');
  }
  return [...normales, ...empaques.map((a: any) => ({ adicionalId: a.id, cantidad: 1 }))];
}
