import { Module } from '@nestjs/common';
import { FinancieroService } from './financiero.service';
import { FinancieroController } from './financiero.controller';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  controllers: [FinancieroController],
  providers: [FinancieroService, RolesGuard],
  exports: [FinancieroService],
})
export class FinancieroModule {}