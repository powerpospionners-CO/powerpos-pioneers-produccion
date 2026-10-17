import { Module } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { InventarioController } from './inventario.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { EmpaquesService } from './empaques.service';
import { EmpaquesController } from './empaques.controller';

@Module({
  imports: [NotificacionesModule],
  controllers: [EmpaquesController, InventarioController],
  providers: [InventarioService, EmpaquesService],
  exports: [InventarioService],
})
export class InventarioModule {}
