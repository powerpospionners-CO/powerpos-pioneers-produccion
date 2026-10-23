import { Injectable, Optional } from '@nestjs/common';
import { EventosService } from '../eventos/eventos.service';
import { randomUUID } from 'crypto';
import { Subject, filter, map, firstValueFrom, timeout, catchError, of } from 'rxjs';
import { contextoSede } from '../prisma/sede-context';

export interface TrabajoImpresion {
  id: string;
  tipo: 'TICKET' | 'COMANDA' | 'CAJON' | 'CIERRE';
  datosBase64: string;
}

interface Confirmacion {
  id: string;
  ok: boolean;
  motivo?: string;
}

@Injectable()
export class ImpresionEventosService {
  constructor(@Optional() private readonly compartidos?: EventosService) {}
  private readonly trabajos = new Subject<{ empresaId: number; sucursalId?: number; trabajo: TrabajoImpresion }>();
  private readonly confirmaciones = new Subject<Confirmacion>();
  private readonly pendientes = new Map<string,{empresaId:number;sucursalId?:number}>();

  paraEmpresa(empresaId: number) {
    if (this.compartidos?.activo) return this.compartidos.escuchar<TrabajoImpresion>(empresaId, 'IMPRESION', true);
    const scope = contextoSede.getStore();
    const sucursalId = scope && scope!=='CONTROL' ? scope.sucursalId : undefined;
    return this.trabajos.asObservable().pipe(
      filter((item) => item.empresaId === empresaId && item.sucursalId===sucursalId),
      map((item) => item.trabajo),
    );
  }

  // Envía el trabajo al agente conectado y espera su confirmación. Si nadie
  // responde a tiempo (agente apagado o desconectado), se resuelve como
  // fallido para que el llamador pueda degradar a impresión por navegador.
  async enviarYEsperar(
    empresaId: number,
    tipo: TrabajoImpresion['tipo'],
    datos: Buffer,
    timeoutMs = 6000,
  ): Promise<{ ok: boolean; motivo?: string }> {
    const id = randomUUID();
    if (this.compartidos?.activo) {
      await this.compartidos.publicar(empresaId, 'IMPRESION', { id, tipo, datosBase64: datos.toString('base64') }, timeoutMs, id);
      return this.compartidos.esperar(empresaId, id, timeoutMs);
    }
    const scope = contextoSede.getStore();
    const sucursalId = scope && scope!=='CONTROL' ? scope.sucursalId : undefined;
    this.pendientes.set(id,{empresaId,sucursalId});

    const esperaConfirmacion = firstValueFrom(
      this.confirmaciones.asObservable().pipe(
        filter((c) => c.id === id),
        timeout(timeoutMs),
        catchError(() =>
          of<Confirmacion>({
            id,
            ok: false,
            motivo: 'El agente de impresión no respondió a tiempo (¿está encendido y conectado?)',
          }),
        ),
      ),
    );

    this.trabajos.next({
      empresaId,
      sucursalId,
      trabajo: { id, tipo, datosBase64: datos.toString('base64') },
    });

    const resultado = await esperaConfirmacion;
    this.pendientes.delete(id);
    return { ok: resultado.ok, motivo: resultado.motivo };
  }

  async confirmar(id: string, ok: boolean, motivo?: string, empresaId?: number) {
    if (typeof id !== 'string' || typeof ok !== 'boolean' || (motivo !== undefined && (typeof motivo !== 'string' || motivo.length > 500))) return;
    if (this.compartidos?.activo) {
      if (empresaId !== undefined) await this.compartidos.confirmar(empresaId, id, { ok, ...(motivo ? { motivo } : {}) });
      return;
    }
    const pendiente = this.pendientes.get(id), scope = contextoSede.getStore();
    if (!pendiente || (empresaId !== undefined && empresaId !== pendiente.empresaId)) return;
    if (pendiente.sucursalId !== undefined && (!scope || scope==='CONTROL' || scope.sucursalId!==pendiente.sucursalId || scope.empresaId!==pendiente.empresaId)) return;
    this.confirmaciones.next({ id, ok, motivo });
  }
}
