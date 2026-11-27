import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { PedidosModule } from '../pedidos/pedidos.module';
import { MesasController } from './mesas.controller';
import { MesasService } from './mesas.service';

@Module({
  imports: [PedidosModule],
  controllers: [MesasController],
  providers: [MesasService, RolesGuard],
})
export class MesasModule {}
