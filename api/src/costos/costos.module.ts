import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { CostosController } from './costos.controller';
import { CostosService } from './costos.service';

@Module({ controllers: [CostosController], providers: [CostosService, RolesGuard] })
export class CostosModule {}
