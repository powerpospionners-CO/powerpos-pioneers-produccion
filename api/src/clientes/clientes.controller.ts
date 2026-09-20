import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA','GERENTE','CAJERO')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  listar(@Request() req: any, @Query('busqueda') busqueda?: string) {
    return this.clientesService.listar(req.user.empresaId, busqueda);
  }

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    return this.clientesService.crear(body, req.user.empresaId);
  }

  @Get(':id')
  detalle(@Param('id') id: string, @Request() req: any) {
    return this.clientesService.obtenerDetalle(+id, req.user.empresaId);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.clientesService.actualizar(+id, body, req.user.empresaId);
  }

  @Patch(':id/toggle-activo')
  toggleActivo(@Param('id') id: string, @Request() req: any) {
    return this.clientesService.toggleActivo(+id, req.user.empresaId);
  }

  @Post(':id/puntos/agregar')
  @Roles('ADMIN_EMPRESA')
  agregarPuntos(@Param('id') id: string, @Body('puntos') puntos: number, @Request() req: any) {
    return this.clientesService.agregarPuntos(+id, puntos, req.user.empresaId);
  }

  @Post(':id/puntos/redimir')
  redimirPuntos(@Param('id') id: string, @Body('puntos') puntos: number, @Request() req: any) {
    return this.clientesService.redimirPuntos(+id, puntos, req.user.empresaId);
  }
}