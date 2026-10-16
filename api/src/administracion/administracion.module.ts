import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AdministracionController } from './administracion.controller';
import { AdministracionGuard } from './administracion.guard';
import { AdministracionService } from './administracion.service';

@Module({
  controllers: [AdministracionController],
  providers: [AdministracionService, AdministracionGuard, RolesGuard],
})
export class AdministracionModule {}
