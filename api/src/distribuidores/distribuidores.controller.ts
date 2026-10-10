import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { DistribuidoresService } from './distribuidores.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('distribuidores')
export class DistribuidoresController {
  constructor(private readonly service: DistribuidoresService) {}

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    return this.service.crear(body, req.user.empresaId);
  }

  @Get()
  listar(@Request() req: any) {
    return this.service.listar(req.user.empresaId);
  }

  // Rutas literales antes de ":id" para que Nest no intente interpretar
  // "liquidaciones" como un id de distribuidor.
  @Get('liquidaciones/todas')
  liquidaciones(@Request() req: any) {
    return this.service.listarLiquidaciones(req.user.empresaId);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Request() req: any) {
    return this.service.obtener(+id, req.user.empresaId);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.actualizar(+id, body, req.user.empresaId);
  }

  @Get(':id/pendientes-liquidar')
  pendientesLiquidar(@Param('id') id: string, @Request() req: any, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.service.pendientesLiquidar(+id, req.user.empresaId, desde, hasta);
  }

  @Post(':id/liquidar')
  liquidar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.liquidar(+id, req.user.empresaId, req.user.id, body?.desde, body?.hasta);
  }

  @Get(':id/liquidaciones')
  liquidacionesDeUno(@Param('id') id: string, @Request() req: any) {
    return this.service.listarLiquidaciones(req.user.empresaId, +id);
  }
}
