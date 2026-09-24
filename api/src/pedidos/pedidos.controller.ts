import { Controller, Get, Post, Body, Param, Patch, UseGuards, Request, Query, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { PedidosService } from './pedidos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PedidosEventosService } from './pedidos-eventos.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService, private readonly eventos: PedidosEventosService) {}

  @Sse('stream')
  stream(@Request() req: any): Observable<MessageEvent> {
    return this.eventos.paraEmpresa(req.user.empresaId).pipe(map((data) => ({ data }) as MessageEvent));
  }

  @Post()
  @Roles('CAJERO', 'ADMIN_EMPRESA', 'GERENTE')
  crear(@Body() body: any, @Request() req: any) {
    return this.pedidosService.crearPedido(
      body,
      req.user.id,
      req.user.empresaId,
    );
  }

  @Get()
  @Roles('CAJERO', 'COCINERO', 'ADMIN_EMPRESA', 'GERENTE', 'DOMICILIARIO')
  listar(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.pedidosService.listarPedidos(
      req.user.empresaId,
      sucursalId ? +sucursalId : undefined,
    );
  }

  @Get('estadisticas')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  estadisticas(@Request() req: any) {
    return this.pedidosService.obtenerEstadisticas(req.user.empresaId);
  }

  @Get(':id')
  @Roles('CAJERO', 'COCINERO', 'ADMIN_EMPRESA', 'GERENTE', 'DOMICILIARIO')
  obtener(@Param('id') id: string, @Request() req: any) {
    return this.pedidosService.obtenerPedido(+id, req.user.empresaId);
  }

  @Patch(':id/estado')
  @Roles('COCINERO', 'CAJERO', 'ADMIN_EMPRESA', 'GERENTE', 'DOMICILIARIO')
  actualizarEstado(@Param('id') id: string, @Body() body: { estado: string }, @Request() req: any) {
    return this.pedidosService.actualizarEstado(+id, body.estado, req.user.empresaId, req.user.id);
  }
}
