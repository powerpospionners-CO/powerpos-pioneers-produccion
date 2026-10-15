import { Module } from '@nestjs/common';
import { SuscripcionesController } from './suscripciones.controller';
import { PlanesService } from './planes.service';

@Module({
  controllers: [SuscripcionesController],
  providers: [PlanesService],
  exports: [PlanesService],
})
export class SuscripcionesModule {}
