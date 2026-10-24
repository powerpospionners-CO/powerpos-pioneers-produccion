import { Module } from '@nestjs/common';
import { AccesoBarrasService } from './acceso-barras.service';
import { AccesoBarrasController } from './acceso-barras.controller';
@Module({ controllers: [AccesoBarrasController], providers: [AccesoBarrasService] })
export class AccesoBarrasModule {}
