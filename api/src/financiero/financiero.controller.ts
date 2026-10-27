import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request, Res } from '@nestjs/common';
import type { Response } from 'express';
import { FinancieroService } from './financiero.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EstadosFinancierosService } from './estados-financieros.service';
import { CorreccionCostosService } from './correccion-costos.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('financiero')
export class FinancieroController {
  constructor(private readonly financieroService: FinancieroService, private readonly estados: EstadosFinancierosService, private readonly costos: CorreccionCostosService) {}

  @Get('estados')
  estadosFinancieros(@Request() req: any, @Query('fechaDesde') desde?: string, @Query('fechaHasta') hasta?: string) {
    return this.estados.obtener(req.user.empresaId, desde, hasta);
  }

  @Post('corregir-costo-granel')
  @Roles('ADMIN_EMPRESA')
  corregirCosto(@Request() req: any, @Body() datos: { productoId: number; costoRegistrado: number; aplicar?: boolean }) {
    return this.costos.corregir(req.user.empresaId, req.user.id, datos);
  }

  @Post('movimiento')
  registrar(@Body() body: any, @Request() req: any) {
    return this.financieroService.registrarMovimiento(
      body,
      req.user.id,
      req.user.empresaId,
      req.user.sucursalId || 1,
    );
  }

  @Patch('movimiento/:id')
  editar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.financieroService.editarMovimiento(+id, body, req.user.empresaId, req.user.id);
  }

  @Delete('movimiento/:id')
  eliminar(@Param('id') id: string, @Request() req: any) {
    return this.financieroService.eliminarMovimiento(+id, req.user.empresaId, req.user.id);
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
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
}
