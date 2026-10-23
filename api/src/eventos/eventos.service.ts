import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { contextoSede } from '../prisma/sede-context';

@Injectable()
export class EventosService {
  constructor(private readonly prisma: PrismaService) {}
  get activo() {
    return process.env.EVENTOS_COMPARTIDOS === 'true';
  }
  private alcance(empresaId: number) {
    const scope = contextoSede.getStore();
    if (scope && scope !== 'CONTROL' && scope.empresaId !== empresaId)
      throw new Error('Evento fuera de la empresa autenticada');
    return {
      empresaId,
      sucursalId: scope && scope !== 'CONTROL' ? scope.sucursalId : null,
    };
  }
  // Capturar el delegate dentro de la petición: el temporizador no cambia de sede.
  publicar(
    empresaId: number,
    canal: string,
    datos: Prisma.InputJsonValue,
    duracionMs: number,
    id?: string,
  ) {
    return this.prisma.eventoSistema.create({
      data: {
        ...this.alcance(empresaId),
        canal,
        datos,
        venceEn: new Date(Date.now() + duracionMs),
        ...(id ? { id } : {}),
      },
    });
  }
  escuchar<T>(
    empresaId: number,
    canal: string,
    reclamar = false,
  ): Observable<T> {
    const where = { ...this.alcance(empresaId), canal };
    const tabla = this.prisma.eventoSistema;
    return new Observable<T>((subscriber) => {
      const vistos = new Map<string, number>();
      let cerrado = false,
        ocupado = false;
      const consultar = async () => {
        if (cerrado || ocupado) return;
        ocupado = true;
        try {
          const ahora = new Date();
          for (const [id, vence] of vistos)
            if (vence <= ahora.getTime()) vistos.delete(id);
          const filas = await tabla.findMany({
            where: {
              ...where,
              venceEn: { gt: ahora },
              ...(reclamar
                ? { reclamadoEn: null }
                : { id: { notIn: [...vistos.keys()] } }),
            },
            orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
            take: 500,
          });
          for (const fila of filas) {
            if (cerrado) break;
            if (vistos.has(fila.id)) continue;
            if (reclamar) {
              const tomada = await tabla.updateMany({
                where: {
                  id: fila.id,
                  ...where,
                  reclamadoEn: null,
                  venceEn: { gt: new Date() },
                },
                data: { reclamadoEn: new Date() },
              });
              if (!tomada.count || cerrado) continue;
            }
            vistos.set(fila.id, fila.venceEn.getTime());
            subscriber.next(fila.datos as T);
          }
        } catch (error) {
          if (!cerrado) subscriber.error(error);
        } finally {
          ocupado = false;
        }
      };
      void consultar();
      const timer = setInterval(() => void consultar(), 500);
      timer.unref?.();
      return () => {
        cerrado = true;
        clearInterval(timer);
      };
    });
  }
  async confirmar(
    empresaId: number,
    id: string,
    confirmacion: Prisma.InputJsonValue,
  ) {
    await this.prisma.eventoSistema.updateMany({
      where: {
        id,
        ...this.alcance(empresaId),
        canal: 'IMPRESION',
        reclamadoEn: { not: null },
        confirmacion: { equals: Prisma.DbNull },
        venceEn: { gt: new Date() },
      },
      data: { confirmacion },
    });
  }
  async esperar(
    empresaId: number,
    id: string,
    timeoutMs: number,
  ): Promise<{ ok: boolean; motivo?: string }> {
    const tabla = this.prisma.eventoSistema,
      where = { id, ...this.alcance(empresaId), canal: 'IMPRESION' };
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
      const fila = await tabla.findFirst({ where });
      if (fila?.confirmacion)
        return fila.confirmacion as { ok: boolean; motivo?: string };
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(200, Math.max(1, limite - Date.now()))),
      );
    }
    // Un trabajo vencido nunca se vuelve a entregar ni se reintenta solo.
    await tabla.updateMany({ where, data: { venceEn: new Date() } });
    return {
      ok: false,
      motivo:
        'El agente no respondió a tiempo; comprueba si imprimió antes de reintentar.',
    };
  }
  @Cron('15 * * * *', { timeZone: 'America/Bogota', waitForCompletion: true })
  async limpiar() {
    if (!this.activo) return;
    const where = { venceEn: { lt: new Date(Date.now() - 86400_000) } };
    await this.prisma.control.eventoSistema.deleteMany({ where });
    return this.prisma.enCadaSede(() =>
      this.prisma.eventoSistema.deleteMany({ where }),
    );
  }
}
