import { Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { ActividadController, AuditoriaController } from './auditoria.controller';

@Module({
  controllers: [AuditoriaController, ActividadController],
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
