import { Body, Controller, Get, Headers, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccesoGastosService } from './acceso-gastos.service';

@Controller('acceso-gastos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccesoGastosController {
  constructor(private readonly servicio: AccesoGastosService) {}
  @Get('estado')
  estado(@Request() req: any) { return this.servicio.estado(req.user); }
  @Post('usuarios/:id')
  @Roles('ADMIN_EMPRESA')
  configurar(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.servicio.configurar(+id, body?.habilitado, req.user); }
  @Post('desbloquear')
  @Roles('CAJERO')
  desbloquear(@Body() body: any, @Request() req: any) { return this.servicio.desbloquear(req.user, body?.codigo); }
  @Post('registrar')
  @Roles('CAJERO')
  async registrar(@Request() req: any, @Headers('x-acceso-gastos') token: string, @Body() body: any) {
    const gasto = await this.servicio.registrar(req.user, token, body);
    req.auditoriaDetalle = { gasto: { id: gasto.id, categoria: gasto.categoria, descripcion: gasto.descripcion, monto: gasto.monto, fecha: gasto.fecha, pagadoConRecaudo: gasto.pagadoConRecaudo }, repetido: gasto.repetido };
    return gasto;
  }
}
