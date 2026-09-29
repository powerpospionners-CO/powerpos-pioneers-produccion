import { Module } from '@nestjs/common';
import { CajaService } from './caja.service';
import { CajaController } from './caja.controller';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { ImpresionModule } from '../impresion/impresion.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [NotificacionesModule, ImpresionModule],
  controllers: [CajaController],
  providers: [CajaService, RolesGuard],
  exports: [CajaService],
})
export class CajaModule {}