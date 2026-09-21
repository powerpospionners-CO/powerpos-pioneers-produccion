import { Controller, Get, Post, Body, Query, UseGuards, Request, Res } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('exportar')
  async exportar(
    @Request() req: any,
    @Res() res: Response,
    @Query('fechaDesde') fechaDesde?: string,
    @Query('fechaHasta') fechaHasta?: string,
  ) {
    const buffer = await this.financieroService.exportarExcel(req.user.empresaId, fechaDesde, fechaHasta);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-financiero.xlsx"');
    res.send(buffer);
  }
}