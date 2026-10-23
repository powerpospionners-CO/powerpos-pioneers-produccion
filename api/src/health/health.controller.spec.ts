import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('Readiness', () => {
  it('comprueba la base y rechaza mantenimiento o errores sin divulgar conexiones', async () => {
    const db = {
      control: {
        $queryRaw: jest.fn().mockResolvedValue([1]),
        eventoSistema: { count: jest.fn() },
      },
      estadoAislamiento: jest
        .fn()
        .mockResolvedValue({ escriturasSuspendidas: false }),
    };
    const health = new HealthController(db as unknown as PrismaService);
    await expect(health.ready()).resolves.toMatchObject({ estado: 'ok' });
    db.estadoAislamiento.mockResolvedValue({ escriturasSuspendidas: true });
    await expect(health.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    db.control.$queryRaw.mockRejectedValue(new Error('conexion-privada'));
    try {
      await health.ready();
    } catch (error) {
      expect(
        JSON.stringify((error as ServiceUnavailableException).getResponse()),
      ).not.toContain('privada');
    }
  });
});
