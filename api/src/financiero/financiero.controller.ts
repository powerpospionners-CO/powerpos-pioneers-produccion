import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { FinancieroService } from './financiero.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('financiero')
export class FinancieroController {
  constructor(private readonly financieroService: FinancieroService) {}

  @Post('movimiento')
  registrar(@Body() body: any, @Request() req: any) {
    return this.financieroService.registrarMovimiento(
      body,
      req.user.id,
      req.user.empresaId,
      req.user.sucursalId || 1,
    );
  }

  @Get('movimientos')
  listar(@Request() req: any, @Query() query: any) {
    return this.financieroService.listarMovimientos(req.user.empresaId, query);
  }

  @Get('resumen')
  resumen(@Request() req: any, @Query('fechaDesde') fechaDesde?: string, @Query('fechaHasta') fechaHasta?: string) {
    return this.financieroService.resumenFinanciero(req.user.empresaId, fechaDesde, fechaHasta);
  }
}