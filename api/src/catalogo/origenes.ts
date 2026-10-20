import { BadRequestException } from '@nestjs/common';

export const ORIGENES_ENCHILA = [
  { codigo: 'MEXICANO', nombre: 'Mexicano' },
  { codigo: 'PERUANO', nombre: 'Peruano' },
  { codigo: 'COLOMBIANO', nombre: 'Colombiano' },
  { codigo: 'ASIATICO', nombre: 'Asiático' },
];

export function normalizarOrigen(valor: unknown) {
  if (typeof valor !== 'string') throw new BadRequestException('Escribe el nombre del origen');
  const nombre = valor.trim().replace(/\s+/g, ' ');
  if (nombre.length < 2 || nombre.length > 50 || !/^[\p{L}][\p{L} -]*$/u.test(nombre))
    throw new BadRequestException('El origen debe tener entre 2 y 50 caracteres: letras, espacios o guiones');
  const codigo = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[ -]+/g, '_');
  return { codigo, nombre };
}
