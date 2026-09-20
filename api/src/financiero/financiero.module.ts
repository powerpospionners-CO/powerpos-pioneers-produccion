import { Module } from '@nestjs/common';
import { FinancieroService } from './financiero.service';
import { FinancieroController } from './financiero.controller';

@Module({
  controllers: [FinancieroController],
  providers: [FinancieroService],
  exports: [FinancieroService],
})
export class FinancieroModule {}