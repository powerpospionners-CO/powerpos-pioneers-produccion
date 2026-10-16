import { Module } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { EstadisticasService } from './estadisticas.service';
import { RolesGuard } from '../auth/roles.guard';
import { RentabilidadHistoricaService } from './rentabilidad-historica.service';

@Module({
  controllers: [ReportesController],
  providers: [ReportesService, EstadisticasService, RentabilidadHistoricaService, RolesGuard],
})
export class ReportesModule {}
