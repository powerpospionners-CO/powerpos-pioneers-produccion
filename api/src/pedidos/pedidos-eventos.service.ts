import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventosService } from '../eventos/eventos.service';
import { Subject, filter, map } from 'rxjs';
import { contextoSede } from '../prisma/sede-context';

export interface PedidoEvento {
  tipo: 'CREADO' | 'ACTUALIZADO';
  pedidoId: number;
  estado: string;
}

@Injectable()
export class PedidosEventosService {
  constructor(@Optional() private readonly compartidos?: EventosService) {}
  private readonly eventos = new Subject<{ empresaId: number; sucursalId?: number; evento: PedidoEvento }>();

  async emitir(empresaId: number, evento: PedidoEvento) {
    if (this.compartidos?.activo) {
      try { await this.compartidos.publicar(empresaId, 'PEDIDOS', { ...evento }, 60_000); }
      catch { Logger.error('No se pudo publicar la actualización de pedidos; la venta confirmada se conserva', 'PedidosEventosService'); }
      return;
    }
    const scope = contextoSede.getStore();
    this.eventos.next({ empresaId, sucursalId: scope && scope!=='CONTROL' ? scope.sucursalId : undefined, evento });
  }

  paraEmpresa(empresaId: number) {
    if (this.compartidos?.activo) return this.compartidos.escuchar<PedidoEvento>(empresaId, 'PEDIDOS');
    const scope = contextoSede.getStore();
    const sucursalId = scope && scope!=='CONTROL' ? scope.sucursalId : undefined;
    return this.eventos.asObservable().pipe(
      filter((item) => item.empresaId === empresaId && item.sucursalId === sucursalId),
      map((item) => item.evento),
    );
  }
}
