import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AdministracionController } from './administracion.controller';
import { AdministracionGuard } from './administracion.guard';
import { AdministracionService } from './administracion.service';
import { GastosRecurrentesService } from './gastos-recurrentes.service';

@Module({
  controllers: [AdministracionController],
  providers: [
    AdministracionService,
    GastosRecurrentesService,
    AdministracionGuard,
    RolesGuard,
  ],
})
export class AdministracionModule {}
