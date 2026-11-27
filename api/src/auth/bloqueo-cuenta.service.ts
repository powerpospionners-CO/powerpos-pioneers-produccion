import { HttpException, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_FALLOS_CUENTA = 10;
export const VENTANA_CUENTA_MS = 15 * 60_000;

// Bloqueo por cuenta: frena a quien prueba contraseñas de un mismo correo desde muchas IP.
// La respuesta es igual exista o no la cuenta, para no revelar qué correos están registrados.
@Injectable()
export class BloqueoCuentaService {
  private readonly logger = new Logger(BloqueoCuentaService.name);
  private readonly memoria = new Map<string, { cantidad: number; vence: number }>();
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private clave(email: string) {
    return createHash('sha256').update(`cuenta:${String(email || '').trim().toLowerCase()}`).digest('hex');
  }

  // Compartido entre instancias cuando hay eventos compartidos; si no, en memoria del proceso.
  private compartido() {
    return process.env.EVENTOS_COMPARTIDOS === 'true' && !!this.prisma?.control;
  }

  private async leer(id: string) {
    const ahora = Date.now();
    if (this.compartido()) {
      const r = await this.prisma!.control.eventoSistema.findUnique({ where: { id } });
      return r && r.venceEn.getTime() > ahora ? { cantidad: Number((r.datos as any)?.cantidad) || 0, vence: r.venceEn.getTime() } : null;
    }
    const r = this.memoria.get(id);
    return r && r.vence > ahora ? r : null;
  }

  async verificar(email: string) {
    const actual = await this.leer(`cuenta-${this.clave(email)}`);
    if (actual && actual.cantidad >= MAX_FALLOS_CUENTA) {
      const minutos = Math.max(1, Math.ceil((actual.vence - Date.now()) / 60_000));
      throw new HttpException(`Por seguridad, esta cuenta está bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} minutos o pide al administrador que restablezca tu contraseña.`, 429);
    }
  }

  async registrarFallo(email: string) {
    const id = `cuenta-${this.clave(email)}`;
    const ahora = Date.now();
    const actual = await this.leer(id);
    const cantidad = (actual?.cantidad || 0) + 1;
    // El bloqueo dura una ventana completa desde el fallo que lo activa.
    const vence = cantidad >= MAX_FALLOS_CUENTA ? ahora + VENTANA_CUENTA_MS : actual?.vence || ahora + VENTANA_CUENTA_MS;
    if (this.compartido()) {
      await this.prisma!.control.eventoSistema.upsert({
        where: { id },
        create: { id, empresaId: 0, canal: 'AUTH_CUENTA', datos: { cantidad }, venceEn: new Date(vence) },
        update: { datos: { cantidad }, venceEn: new Date(vence) },
      });
    } else {
      if (!this.memoria.has(id) && this.memoria.size >= 10_000) for (const [k, v] of this.memoria) if (v.vence <= ahora) this.memoria.delete(k);
      this.memoria.set(id, { cantidad, vence });
    }
    if (cantidad === MAX_FALLOS_CUENTA) this.logger.warn('Cuenta bloqueada temporalmente por intentos fallidos');
  }

  async limpiar(email: string) {
    const id = `cuenta-${this.clave(email)}`;
    if (this.compartido()) await this.prisma!.control.eventoSistema.deleteMany({ where: { id } });
    else this.memoria.delete(id);
  }
}
