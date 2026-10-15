import { Module } from '@nestjs/common';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  controllers: [ComprasController],
  providers: [ComprasService, RolesGuard],
  exports: [ComprasService],
})
export class ComprasModule {}
