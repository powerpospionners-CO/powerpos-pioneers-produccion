import type { Response } from 'express';
import { excelReport, ReportSheet } from '../common/excel-report';
import { Controller, Get, Query, UseGuards, Request, Res } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EstadisticasService } from './estadisticas.service';
import { RentabilidadHistoricaService } from './rentabilidad-historica.service';

@UseGuards(JwtAuthGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService, private readonly estadisticasService: EstadisticasService, private readonly historica: RentabilidadHistoricaService) {}

  @Get('rentabilidad-historica') @UseGuards(RolesGuard) @Roles('ADMIN_EMPRESA', 'GERENTE')
  rentabilidadHistorica(@Request() req: any, @Query('desde') desde: string, @Query('hasta') hasta: string, @Query('sucursalId') sucursalId?: string) {
    return this.historica.consultar(req.user.empresaId, desde, hasta, sucursalId);
  }
  @Get('rentabilidad-historica/exportar') @UseGuards(RolesGuard) @Roles('ADMIN_EMPRESA', 'GERENTE')
  async exportarHistorica(@Request() req: any, @Res() res: Response, @Query('desde') desde: string, @Query('hasta') hasta: string, @Query('sucursalId') sucursalId?: string) {
    this.enviarExcel(res, await this.historica.exportar(req.user.empresaId, desde, hasta, sucursalId), 'rentabilidad-historica.xlsx');
  }

  @Get('estadisticas')
  @UseGuards(RolesGuard)
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  estadisticas(@Request() req: any, @Query('desde') desde: string, @Query('hasta') hasta: string, @Query('sucursalId') sucursalId?: string) {
    return this.estadisticasService.consultar(req.user.empresaId, desde, hasta, sucursalId);
  }

  @Get('estadisticas/exportar')
  @UseGuards(RolesGuard)
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  async exportarEstadisticas(@Request() req: any, @Res() res: Response, @Query('desde') desde: string, @Query('hasta') hasta: string, @Query('sucursalId') sucursalId?: string) {
    const d = await this.estadisticasService.consultar(req.user.empresaId, desde, hasta, sucursalId);
    const branch = d.sucursalesDisponibles.find(s => s.id === d.filtro.sucursalId)?.nombre || 'Consolidado de la empresa';
    const sheets: ReportSheet[] = [
      { name: 'Resumen', headers: ['Indicador', 'Valor'], rows: [['Ventas (COP)', d.ventas], ['Pedidos', d.cantidad], ['Ticket promedio (COP)', d.ticketPromedio], ['Descuentos (COP)', d.descuentos], ['Pedidos anulados', d.anuladas], ['Valor anulado (COP)', d.valorAnulado], ['Ventas periodo anterior (COP)', d.anterior.total]] },
      { name: 'Ventas diarias', headers: ['Fecha', 'Ventas', 'Pedidos'], money: [1], rows: d.diarias.map(v => [v.fecha, v.total, v.cantidad]), chart: { title: 'Ventas por día · COP', label: 0, value: 1, limit: 93 } },
      { name: 'Ventas por hora', headers: ['Hora', 'Ventas', 'Promedio diario', 'Pedidos'], money: [1,2], rows: d.horas.map(v => [v.hora, v.total, v.promedioDiario, v.cantidad]), chart: { title: 'Ventas por hora · COP', label: 0, value: 1, limit: 24 } },
      { name: 'Sucursales', headers: ['Sucursal', 'Ventas', 'Pedidos'], money: [1], rows: d.sucursales.map(v => [v.nombre, v.total, v.cantidad]), chart: { title: 'Ventas por sucursal · COP', label: 0, value: 1 } },
      { name: 'Medios de pago', headers: ['Medio', 'Monto'], money: [1], rows: d.medios.map(v => [v.medio, v.monto]), chart: { title: 'Medios de pago · COP', label: 0, value: 1 } },
      { name: 'Productos', headers: ['Producto', 'Cantidad', 'Subtotal'], money: [2], rows: d.productos.map(v => [v.nombre, v.cantidad, v.subtotal]), chart: { title: 'Productos · COP', label: 0, value: 2 } },
    ];
    this.enviarExcel(res, await excelReport('Estadísticas', `${d.filtro.desde} a ${d.filtro.hasta} · ${branch}`, sheets), 'estadisticas.xlsx');
  }

  @Get('exportar')
  @UseGuards(RolesGuard)
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  async exportar(@Request() req: any, @Res() res: Response) {
    const id = req.user.empresaId;
    const [empleados, clientes, periodos, productos] = await Promise.all([
      this.reportesService.rendimientoPorEmpleado(id), this.reportesService.mejoresClientes(id, 10),
      this.reportesService.comparativaPorPeriodo(id), this.reportesService.rentabilidadPorProducto(id),
    ]);
    const sheets: ReportSheet[] = [
      { name: 'Comparativas', headers: ['Periodo', 'Ventas actuales', 'Ventas anteriores', 'Pedidos actuales'], money: [1,2], rows: [['Semana', periodos.semana.actual.total, periodos.semana.anterior.total, periodos.semana.actual.cantidadPedidos], ['Mes', periodos.mes.actual.total, periodos.mes.anterior.total, periodos.mes.actual.cantidadPedidos]], chart: { title: 'Ventas actuales · COP', label: 0, value: 1 } },
      { name: 'Empleados', headers: ['Empleado', 'Ventas', 'Pedidos', 'Ticket promedio'], money: [1,3], rows: empleados.map(v => [v.nombre, v.totalVentas, v.cantidadPedidos, v.ticketPromedio]), chart: { title: 'Ventas por empleado · COP', label: 0, value: 1 } },
      { name: 'Clientes', headers: ['Cliente', 'Total gastado', 'Pedidos', 'Puntos'], money: [1], rows: clientes.map(v => [v.nombre, v.totalGastado, v.cantidadPedidos, v.puntos]), chart: { title: 'Mejores clientes · COP', label: 0, value: 1 } },
      { name: 'Rentabilidad', headers: ['Producto', 'Precio venta', 'Costo', 'Margen absoluto', 'Margen (%)', 'Costos definidos'], money: [1,2,3], rows: productos.map(v => [v.nombre, v.precioVenta, v.costoReceta, v.margenAbsoluto, v.margenPorcentual, v.tieneCostosDefinidos ? 'Sí' : 'No']), chart: { title: 'Margen estimado · COP', label: 0, value: 3 } },
    ];
    this.enviarExcel(res, await excelReport('Reportes avanzados', 'Empleados y clientes: histórico. Comparativas: semana y mes. Rentabilidad estimada con costos actuales.', sheets), 'reportes.xlsx');
  }

  private enviarExcel(res: Response, buffer: Buffer, filename: string) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }

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
