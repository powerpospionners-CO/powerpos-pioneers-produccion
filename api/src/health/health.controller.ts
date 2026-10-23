import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Get('ready')
  async ready() {
    try {
      await this.prisma.control.$queryRaw`SELECT 1`;
      const estado = await this.prisma.estadoAislamiento();
      if (estado?.escriturasSuspendidas) throw new Error('Mantenimiento');
      if (process.env.EVENTOS_COMPARTIDOS === 'true')
        await this.prisma.control.eventoSistema.count();
      return { estado: 'ok', baseControl: 'disponible' };
    } catch {
      throw new ServiceUnavailableException({ estado: 'no_disponible' });
    }
  }
}
