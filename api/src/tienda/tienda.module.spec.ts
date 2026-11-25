import { Test } from '@nestjs/testing';
import { TiendaModule } from './tienda.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { TiendaService } from './tienda.service';
import { TiendaExtrasService } from './tienda-extras.service';
import { PedidosService } from '../pedidos/pedidos.service';

describe('Módulo de tienda', () => {
  it('resuelve cupones, reservas, boletín y cuentas dentro del servicio de pedidos web', async () => {
    const modulo = await Test.createTestingModule({ imports: [TiendaModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(PedidosService).useValue({})
      .useMocker((token) => (token === NotificacionesService ? {} : undefined))
      .compile();
    const tienda = modulo.get(TiendaService) as any;
    expect(tienda.extras).toBe(modulo.get(TiendaExtrasService));
    expect(tienda.registros).toBeDefined();
  });
});
