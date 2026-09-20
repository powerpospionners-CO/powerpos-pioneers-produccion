import { Module } from '@nestjs/common';
import { ImpresionController } from './impresion.controller';
import { ImpresionService } from './impresion.service';

@Module({
  controllers: [ImpresionController],
  providers: [ImpresionService],
  exports: [ImpresionService],
})
export class ImpresionModule {}