import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccesoBarrasService } from './acceso-barras.service';

@Controller('acceso-barras')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccesoBarrasController {
  constructor(private readonly servicio: AccesoBarrasService) {}
  @Get('estado')
  estado(@Request() req: any) { return this.servicio.estado(req.user); }
  @Post('usuarios/:id')
  @Roles('ADMIN_EMPRESA')
  configurar(@Param('id') id: string, @Body() body: any, @Request() req: any) { return this.servicio.configurar(+id, body?.habilitado, req.user); }
  @Post('desbloquear')
  @Roles('CAJERO')
  desbloquear(@Body() body: any, @Request() req: any) { return this.servicio.desbloquear(req.user, body?.codigo); }
  @Get('productos')
  @Roles('CAJERO')
  listar(@Request() req: any, @Headers('x-acceso-barras') token: string, @Query('buscar') buscar?: string, @Query('despues') despues?: string, @Query('sinCodigo') sinCodigo?: string) { return this.servicio.listar(req.user, token, buscar, despues, sinCodigo); }
  @Patch('productos/:id')
  @Roles('CAJERO')
  async guardar(@Param('id') id: string, @Body() body: any, @Request() req: any, @Headers('x-acceso-barras') token: string) {
    const producto = await this.servicio.guardar(req.user, token, +id, body);
    req.auditoriaDetalle = { productoId: producto.id, nombre: producto.nombre, anterior: producto.anterior, nuevo: producto.codigoBarras };
    return producto;
  }
}
