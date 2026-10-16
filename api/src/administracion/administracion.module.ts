import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AdministracionController } from './administracion.controller';
import { AdministracionGuard } from './administracion.guard';
import { AdministracionService } from './administracion.service';
import { GastosRecurrentesService } from './gastos-recurrentes.service';
import { ConteosService } from './conteos.service';
import { AntiguedadService } from './antiguedad.service';
import { OrdenesCompraService } from './ordenes-compra.service';
import { ComprasModule } from '../compras/compras.module';

@Module({
  imports: [ComprasModule],
  controllers: [AdministracionController],
  providers: [
    AdministracionService,
    GastosRecurrentesService,
    ConteosService,
    AntiguedadService,
    OrdenesCompraService,
    AdministracionGuard,
    RolesGuard,
  ],
})
export class AdministracionModule {}
