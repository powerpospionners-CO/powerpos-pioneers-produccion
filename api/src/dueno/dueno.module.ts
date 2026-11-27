import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { DuenoController } from './dueno.controller';
import { DuenoService } from './dueno.service';

@Module({ controllers: [DuenoController], providers: [DuenoService, RolesGuard] })
export class DuenoModule {}
