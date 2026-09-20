import { Injectable } from '@nestjs/common';
import { Subject, filter, map } from 'rxjs';

export interface PedidoEvento {
  tipo: 'CREADO' | 'ACTUALIZADO';
  pedidoId: number;
  estado: string;
}

@Injectable()
export class PedidosEventosService {
  private readonly eventos = new Subject<{ empresaId: number; evento: PedidoEvento }>();

  emitir(empresaId: number, evento: PedidoEvento) {
    this.eventos.next({ empresaId, evento });
  }

  paraEmpresa(empresaId: number) {
    return this.eventos.asObservable().pipe(
      filter((item) => item.empresaId === empresaId),
      map((item) => item.evento),
    );
  }
}
