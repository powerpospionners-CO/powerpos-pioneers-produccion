import { BadRequestException } from '@nestjs/common';

export const CONSECUTIVO_DISTRIBUIDOR = 'ConsecutivoDistribuidor';
export function siguienteCodigo(codigos: string[], reservado = 0) {
  let ultimo = Number.isSafeInteger(reservado) && reservado >= 0 ? reservado : 0;
  for (const codigo of codigos) {
    const numero = /^\s*DIST-\s*(\d+)\s*$/i.exec(codigo)?.[1];
    if (!numero) continue;
    const valor = Number(numero);
    if (!Number.isSafeInteger(valor)) throw new BadRequestException('El consecutivo de distribuidores supera el rango permitido');
    ultimo = Math.max(ultimo, valor);
  }
  if (!Number.isSafeInteger(ultimo + 1)) throw new BadRequestException('El consecutivo de distribuidores supera el rango permitido');
  return { codigo: `DIST-${String(ultimo + 1).padStart(3, '0')}`, numero: ultimo + 1 };
}
export function dominioDistribuidor(nombre: string, correos: string[]) {
  const dominios = new Map<string, number>();
  for (const correo of correos) {
    const dominio = correo.toLowerCase().split('@')[1];
    if (dominio && /^distribuidor\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.com$/.test(dominio)) dominios.set(dominio, (dominios.get(dominio) ?? 0) + 1);
  }
  const existente = [...dominios].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (existente) return existente;
  const marca = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 63);
  if (!marca) throw new BadRequestException('La empresa necesita un nombre válido para generar el correo');
  return `distribuidor.${marca}.com`;
}
export function correoDistribuidor(valor: unknown, dominio: string) {
  const usuario = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(usuario) || usuario.length > 64) throw new BadRequestException('Escribe solo el nombre de acceso, sin @, espacios ni tildes');
  const email = `${usuario}@${dominio}`;
  if (email.length > 150) throw new BadRequestException('El correo de acceso es demasiado largo');
  return email;
}
