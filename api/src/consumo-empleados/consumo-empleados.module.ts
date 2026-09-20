import { Module } from '@nestjs/common';
import { ConsumoEmpleadosService } from './consumo-empleados.service';
import { ConsumoEmpleadosController } from './consumo-empleados.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [AuditoriaModule],
  controllers: [ConsumoEmpleadosController],
  providers: [ConsumoEmpleadosService],
})
export class ConsumoEmpleadosModule {}
