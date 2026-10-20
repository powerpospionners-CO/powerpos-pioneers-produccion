import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class TareasService {
  private readonly logger = new Logger(TareasService.name);
  constructor(private prisma: PrismaService, private notificaciones: NotificacionesService) {}

  @Cron('0 8 * * *', { timeZone: 'America/Bogota', waitForCompletion: true })
  async revisarCumpleanos() {
    if (this.prisma.enCadaSede) await this.prisma.enCadaSede(() => this.notificarCumpleanosDeHoy());
    else await this.notificarCumpleanosDeHoy();
  }

  async notificarCumpleanosDeHoy(empresaId?: number) {
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const mesDia = fecha.slice(5);
    const empresas = await this.prisma.empresa.findMany({
      where: { activo: true, ...(empresaId ? { id: empresaId } : {}) },
      include: { clientes: { where: { activo: true, email: { not: null }, fechaNacimiento: { not: null } } } },
    });
    let clientesNotificados = 0, administradoresNotificados = 0;
    for (const empresa of empresas) {
      const { administradores, correoConfigurado } = await this.notificaciones.configuracion(empresa.id);
      if (!correoConfigurado) continue;
      for (const cliente of empresa.clientes) {
        if (!cliente.email || !cliente.fechaNacimiento || cliente.fechaNacimiento.toISOString().slice(5, 10) !== mesDia) continue;
        if (await this.felicitar(empresa.id, cliente.id, 'Cliente', fecha, cliente, empresa.nombre)) clientesNotificados++;
      }
      for (const admin of administradores) {
        if (!admin.email || !admin.cumpleanos || admin.fechaNacimiento.slice(5) !== mesDia) continue;
        if (await this.felicitar(empresa.id, admin.id, 'Administrador', fecha, admin, 'PowerPOS')) administradoresNotificados++;
      }
    }
    return { clientesNotificados, administradoresNotificados };
  }

  private async felicitar(empresaId: number, id: number, tipo: string, fecha: string,
    persona: { nombre: string; email?: string | null }, remitente: string) {
    // Reserva por persona/día en la base de la sede, incluso con varias instancias.
    const entidad = `Cumpleanos${tipo}`;
    const reserva = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${empresaId}, 81727)`;
      if (await tx.auditoria.findFirst({ where: { empresaId, entidad, entidadId: id, detalle: { path: ['fecha'], equals: fecha } } })) return null;
      return tx.auditoria.create({ data: { empresaId, entidad, entidadId: id, accion: 'RESERVADO', detalle: { fecha } } });
    });
    if (!reserva) return false;
    const resultado = await this.notificaciones.enviarFelicitacionCumpleanos(persona, remitente, tipo === 'Administrador');
    await this.prisma.auditoria.update({ where: { id: reserva.id }, data: { accion: resultado.enviado ? 'ENVIADO' : 'NO_CONFIRMADO' } });
    if (!resultado.enviado) this.logger.warn('Saludo de cumpleaños sin confirmación; registrado sin reintento automático para evitar duplicados');
    return resultado.enviado;
  }
}
