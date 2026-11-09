import { Module } from '@nestjs/common';
import { FinancieroService } from './financiero.service';
import { FinancieroController } from './financiero.controller';
import { RolesGuard } from '../auth/roles.guard';
import { EstadosFinancierosService } from './estados-financieros.service';
import { CorreccionCostosService } from './correccion-costos.service';
import { PlanCuentasController } from './plan-cuentas.controller';
import { PlanCuentasService } from './plan-cuentas.service';

@Module({
  controllers: [FinancieroController, PlanCuentasController],
  providers: [FinancieroService, EstadosFinancierosService, CorreccionCostosService, PlanCuentasService, RolesGuard],
  exports: [FinancieroService],
})
export class FinancieroModule {}
