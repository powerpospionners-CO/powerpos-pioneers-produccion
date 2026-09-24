import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// Todas las aperturas, ventas, anulaciones y cierres de una sucursal comparten
// el mismo bloqueo en PostgreSQL, también con varias instancias de la API.
export async function bloquearCajaSucursal(
  db: Prisma.TransactionClient,
  sucursalId: number,
) {
  if (!Number.isInteger(sucursalId) || sucursalId <= 0) {
    throw new BadRequestException('Sucursal no válida');
  }
  await db.$executeRaw`SELECT pg_advisory_xact_lock(73102, ${sucursalId}::integer)`;
}
