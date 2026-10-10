import { Module } from '@nestjs/common';
import { DistribuidoresService } from './distribuidores.service';
import { DistribuidoresController } from './distribuidores.controller';
import { PedidosDistribuidorService } from './pedidos-distribuidor.service';
import { PedidosDistribuidorController } from './pedidos-distribuidor.controller';

@Module({
  controllers: [DistribuidoresController, PedidosDistribuidorController],
  providers: [DistribuidoresService, PedidosDistribuidorService],
})
export class DistribuidoresModule {}
