import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Subject, filter, map, firstValueFrom, timeout, catchError, of } from 'rxjs';

export interface TrabajoImpresion {
  id: string;
  tipo: 'TICKET' | 'COMANDA' | 'CAJON';
  datosBase64: string;
}

interface Confirmacion {
  id: string;
  ok: boolean;
  motivo?: string;
}

@Injectable()
export class ImpresionEventosService {
  private readonly trabajos = new Subject<{ empresaId: number; trabajo: TrabajoImpresion }>();
  private readonly confirmaciones = new Subject<Confirmacion>();

  paraEmpresa(empresaId: number) {
    return this.trabajos.asObservable().pipe(
      filter((item) => item.empresaId === empresaId),
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
      trabajo: { id, tipo, datosBase64: datos.toString('base64') },
    });

    const resultado = await esperaConfirmacion;
    return { ok: resultado.ok, motivo: resultado.motivo };
  }

  confirmar(id: string, ok: boolean, motivo?: string) {
    this.confirmaciones.next({ id, ok, motivo });
  }
}
