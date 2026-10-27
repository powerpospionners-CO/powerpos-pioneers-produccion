import { Module } from '@nestjs/common';
import { FinancieroService } from './financiero.service';
import { FinancieroController } from './financiero.controller';
import { RolesGuard } from '../auth/roles.guard';
import { EstadosFinancierosService } from './estados-financieros.service';
import { CorreccionCostosService } from './correccion-costos.service';

@Module({
  controllers: [FinancieroController],
  providers: [FinancieroService, EstadosFinancierosService, CorreccionCostosService, RolesGuard],
  exports: [FinancieroService],
})
export class FinancieroModule {}
