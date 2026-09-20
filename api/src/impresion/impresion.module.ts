import { Module } from '@nestjs/common';
import { ImpresionController, ImpresionAgenteController } from './impresion.controller';
import { ImpresionService } from './impresion.service';
import { ImpresionEventosService } from './impresion-eventos.service';
import { AgenteImpresionGuard } from './agente-impresion.guard';

@Module({
  controllers: [ImpresionController, ImpresionAgenteController],
  providers: [ImpresionService, ImpresionEventosService, AgenteImpresionGuard],
  exports: [ImpresionService],
})
export class ImpresionModule {}
