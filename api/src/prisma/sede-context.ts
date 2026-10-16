import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';
export type ContextoSede = {
  empresaId: number;
  sucursalId: number;
  cliente: PrismaClient;
};
export const contextoSede = new AsyncLocalStorage<ContextoSede | 'CONTROL'>();
