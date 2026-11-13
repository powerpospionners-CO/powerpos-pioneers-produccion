import { Module } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { OrigenesService } from './origenes.service';

@Module({
  imports: [NotificacionesModule],
  controllers: [ProductosController],
  providers: [ProductosService, OrigenesService],
  exports: [ProductosService],
})
export class ProductosModule {}
