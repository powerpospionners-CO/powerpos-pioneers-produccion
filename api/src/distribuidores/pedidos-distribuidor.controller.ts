import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { PedidosDistribuidorService } from './pedidos-distribuidor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DISTRIBUIDOR', 'ADMIN_EMPRESA', 'GERENTE')
@Controller('pedidos-distribuidor')
export class PedidosDistribuidorController {
  constructor(private readonly service: PedidosDistribuidorService) {}

  @Post()
  @Roles('DISTRIBUIDOR')
  crear(@Body() body: any, @Request() req: any) {
    if (!req.user.distribuidorId) throw new ForbiddenException('Esta cuenta no tiene un perfil de distribuidor');
    return this.service.crearPedido(body, req.user.distribuidorId, req.user.sucursalId, req.user.empresaId, req.user.id);
  }

  @Get()
  listar(@Request() req: any, @Query('distribuidorId') distribuidorId?: string) {
    // El distribuidor solo puede ver los suyos, sin importar qué pida por query.
    const filtro = req.user.rol === 'DISTRIBUIDOR' ? req.user.distribuidorId : (distribuidorId ? +distribuidorId : undefined);
    return this.service.listar(req.user.empresaId, filtro);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Request() req: any) {
    const propio = req.user.rol === 'DISTRIBUIDOR' ? req.user.distribuidorId : undefined;
    return this.service.obtener(+id, req.user.empresaId, propio);
  }

  @Patch(':id/anular')
  anular(@Param('id') id: string, @Request() req: any) {
    const propio = req.user.rol === 'DISTRIBUIDOR' ? req.user.distribuidorId : undefined;
    return this.service.anular(+id, req.user.empresaId, req.user.id, propio);
  }
}
