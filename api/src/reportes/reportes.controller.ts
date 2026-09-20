import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('empleados')
  rendimientoPorEmpleado(@Request() req: any) {
    return this.reportesService.rendimientoPorEmpleado(req.user.empresaId);
  }

  @Get('clientes')
  mejoresClientes(@Request() req: any, @Query('limite') limite?: string) {
    return this.reportesService.mejoresClientes(req.user.empresaId, limite ? +limite : 10);
  }

  @Get('periodos')
  comparativaPorPeriodo(@Request() req: any) {
    return this.reportesService.comparativaPorPeriodo(req.user.empresaId);
  }

  @Get('rentabilidad')
  rentabilidadPorProducto(@Request() req: any) {
    return this.reportesService.rentabilidadPorProducto(req.user.empresaId);
  }

  @Get('periodo')
  periodo(@Request() req: any, @Query('tipo') tipo?: string, @Query('fecha') fecha?: string) {
    const tipoReporte = (tipo || 'DIARIO').toUpperCase();
    return this.reportesService.generarReportePeriodo(req.user.empresaId, tipoReporte as 'DIARIO' | 'MENSUAL' | 'ANUAL', fecha);
  }

  @Get('diario')
  diario(@Request() req: any, @Query('fecha') fecha?: string) {
    return this.reportesService.generarReportePeriodo(req.user.empresaId, 'DIARIO', fecha);
  }

  @Get('mensual')
  mensual(@Request() req: any, @Query('fecha') fecha?: string) {
    return this.reportesService.generarReportePeriodo(req.user.empresaId, 'MENSUAL', fecha);
  }

  @Get('anual')
  anual(@Request() req: any, @Query('fecha') fecha?: string) {
    return this.reportesService.generarReportePeriodo(req.user.empresaId, 'ANUAL', fecha);
  }
}