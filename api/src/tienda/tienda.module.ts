import { Module } from '@nestjs/common';
import { PedidosModule } from '../pedidos/pedidos.module';
import { RolesGuard } from '../auth/roles.guard';
import { TiendaService } from './tienda.service';
import {
  TiendaAdminController,
  TiendaPublicaController,
} from './tienda.controller';
import { PedidosPublicosGuard } from './pedidos-publicos.guard';
@Module({
  imports: [PedidosModule],
  providers: [TiendaService, RolesGuard, PedidosPublicosGuard],
  controllers: [TiendaAdminController, TiendaPublicaController],
})
export class TiendaModule {}
