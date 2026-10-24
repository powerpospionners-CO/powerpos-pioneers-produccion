import { Module } from '@nestjs/common';
import { AccesoGastosService } from './acceso-gastos.service';
import { AccesoGastosController } from './acceso-gastos.controller';
import { FinancieroModule } from '../financiero/financiero.module';
@Module({ imports: [FinancieroModule], controllers: [AccesoGastosController], providers: [AccesoGastosService] })
export class AccesoGastosModule {}
