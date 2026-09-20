import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { CajaService } from './caja.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
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
}
