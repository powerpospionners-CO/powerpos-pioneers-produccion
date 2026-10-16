import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AdministracionController } from './administracion.controller';
import { AdministracionGuard } from './administracion.guard';
import { AdministracionService } from './administracion.service';
import { GastosRecurrentesService } from './gastos-recurrentes.service';
import { ConteosService } from './conteos.service';
import { AntiguedadService } from './antiguedad.service';

@Module({
  controllers: [AdministracionController],
  providers: [
    AdministracionService,
    GastosRecurrentesService,
    ConteosService,
    AntiguedadService,
    AdministracionGuard,
    RolesGuard,
  ],
})
export class AdministracionModule {}
