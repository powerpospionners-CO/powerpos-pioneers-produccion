import { Module } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { EstadisticasService } from './estadisticas.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  controllers: [ReportesController],
  providers: [ReportesService, EstadisticasService, RolesGuard],
})
export class ReportesModule {}
