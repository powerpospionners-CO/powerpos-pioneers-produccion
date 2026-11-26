import { Module } from '@nestjs/common';
import { PedidosModule } from '../pedidos/pedidos.module';
import { RolesGuard } from '../auth/roles.guard';
import { TiendaService } from './tienda.service';
import {
  TiendaAdminController,
  TiendaPublicaController,
} from './tienda.controller';
import { PedidosPublicosGuard } from './pedidos-publicos.guard';
import { BoldService } from './bold.service';
import { TiendaRegistros } from './tienda-registros';
import { TiendaExtrasService } from './tienda-extras.service';
import { TiendaExperienciaService } from './tienda-experiencia.service';
import { LimitePublicoGuard } from './limite-publico.guard';
@Module({
  imports: [PedidosModule],
  providers: [TiendaService, BoldService, RolesGuard, PedidosPublicosGuard, TiendaRegistros, TiendaExtrasService, TiendaExperienciaService, LimitePublicoGuard],
  controllers: [TiendaAdminController, TiendaPublicaController],
})
export class TiendaModule {}
