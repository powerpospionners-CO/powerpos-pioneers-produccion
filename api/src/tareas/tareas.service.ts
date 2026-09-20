import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class TareasService {
  private readonly logger = new Logger(TareasService.name);

  constructor(
    private prisma: PrismaService,
    private notificaciones: NotificacionesService,
  ) {}

  // Corre todos los días a las 8:00 a.m.
  @Cron('0 8 * * *')
  async revisarCumpleanos() {
    this.logger.log('Revisando cumpleaños del día...');
    await this.notificarCumpleanosDeHoy();
  }

  /**
   * Lógica separada del decorador @Cron para poder probarla manualmente
   * vía un endpoint sin esperar a las 8:00 a.m.
   */
  async notificarCumpleanosDeHoy() {
    const hoy = new Date();
    const mes = hoy.getUTCMonth() + 1;
    const dia = hoy.getUTCDate();

    const empresas = await this.prisma.empresa.findMany({
      where: { activo: true },
      include: {
        clientes: { where: { activo: true } },
      },
    });

    let totalNotificados = 0;

    for (const empresa of empresas) {
      const cumpleaneros = empresa.clientes.filter((c) => {
        if (!c.fechaNacimiento) return false;
        const fecha = new Date(c.fechaNacimiento);
        return fecha.getUTCMonth() + 1 === mes && fecha.getUTCDate() === dia;
      });

      if (cumpleaneros.length === 0) continue;

      // Felicitar a cada cliente
      for (const cliente of cumpleaneros) {
        await this.notificaciones.enviarFelicitacionCumpleanos(
          { nombre: cliente.nombre, telefono: cliente.telefono, email: cliente.email },
          empresa.nombre,
        );
        totalNotificados++;
      }

      // Avisar al admin con el resumen del día
      const listaNombres = cumpleaneros.map((c) => c.nombre).join(', ');
      await this.notificaciones.enviarAlerta({
        tipo: 'CUMPLEAÑOS DE CLIENTES',
        mensaje: `🎂 Hoy cumplen años: ${listaNombres}. Ya se les envió un mensaje de felicitación.`,
        empresa: empresa.nombre,
        sucursal: 'Todas',
      });
    }

    this.logger.log(`Cumpleaños procesados: ${totalNotificados} cliente(s) notificado(s)`);
    return { clientesNotificados: totalNotificados };
  }
}