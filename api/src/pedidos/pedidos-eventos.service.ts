import { Injectable } from '@nestjs/common';
import { Subject, filter, map } from 'rxjs';
import { contextoSede } from '../prisma/sede-context';

export interface PedidoEvento {
  tipo: 'CREADO' | 'ACTUALIZADO';
  pedidoId: number;
  estado: string;
}

@Injectable()
export class PedidosEventosService {
  private readonly eventos = new Subject<{ empresaId: number; sucursalId?: number; evento: PedidoEvento }>();

  emitir(empresaId: number, evento: PedidoEvento) {
    const scope = contextoSede.getStore();
    this.eventos.next({ empresaId, sucursalId: scope && scope!=='CONTROL' ? scope.sucursalId : undefined, evento });
  }

  paraEmpresa(empresaId: number) {
    const scope = contextoSede.getStore();
    const sucursalId = scope && scope!=='CONTROL' ? scope.sucursalId : undefined;
    return this.eventos.asObservable().pipe(
      filter((item) => item.empresaId === empresaId && item.sucursalId === sucursalId),
      map((item) => item.evento),
    );
  }
}
