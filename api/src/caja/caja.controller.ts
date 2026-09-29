import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { CajaService } from './caja.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CAJERO', 'ADMIN_EMPRESA', 'GERENTE')
@Controller('caja')
export class CajaController {
  constructor(private readonly cajaService: CajaService) {}

  @Post('abrir')
  abrir(@Body() body: any, @Request() req: any) {
    return this.cajaService.abrirCaja(body, req.user.id, req.user.sucursalId, req.user.empresaId);
  }

  @Post(':id/cerrar')
  cerrar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.cajaService.cerrarCaja(+id, body, req.user.id, false, req.user.empresaId);
  }

  @Get('abierta')
  obtenerAbierta(@Request() req: any) {
    return this.cajaService.obtenerCajaAbierta(req.user.sucursalId, req.user.empresaId);
  }

  @Get('eventos')
  obtenerEventos(@Request() req: any) {
    return this.cajaService.obtenerEventos(req.user.sucursalId, req.user.empresaId);
  }

  @Get('alertas')
  obtenerAlertas(@Request() req: any) {
    return this.cajaService.obtenerAlertas(req.user.sucursalId, req.user.empresaId);
  }

  @Post('apertura-irregular')
  aperturaIrregular(@Body() body: any, @Request() req: any) {
    return this.cajaService.registrarAperturaIrregular(body.cajaId, req.user.id, body.descripcion, req.user.empresaId);
  }

  @Get('historial')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  historial(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.cajaService.listarCajasCerradas(req.user.empresaId, sucursalId ? +sucursalId : undefined);
  }

  @Get(':id/resumen')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  resumen(@Param('id') id: string, @Request() req: any) {
    return this.cajaService.obtenerResumenCaja(+id, req.user.empresaId);
  }

  @Patch(':id/corregir')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  corregir(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.cajaService.corregirCierre(+id, body.montoFinal, body.motivo, req.user.id, req.user.empresaId);
  }
}
