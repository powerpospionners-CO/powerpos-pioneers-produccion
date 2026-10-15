import { Module } from '@nestjs/common';
import { SuperadminController } from './superadmin.controller';
import { SuperadminService } from './superadmin.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { SuscripcionesModule } from '../suscripciones/suscripciones.module';

@Module({
  imports: [AuditoriaModule, SuscripcionesModule],
  controllers: [SuperadminController],
  providers: [SuperadminService],
})
export class SuperadminModule {}