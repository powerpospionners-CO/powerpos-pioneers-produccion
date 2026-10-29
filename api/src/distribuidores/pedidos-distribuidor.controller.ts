import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { PedidosDistribuidorService } from './pedidos-distribuidor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OperacionesVentaService, CobroCredito } from '../pedidos/operaciones-venta.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DISTRIBUIDOR', 'CAJERO', 'ADMIN_EMPRESA', 'GERENTE')
@Controller('pedidos-distribuidor')
export class PedidosDistribuidorController {
  constructor(private readonly service: PedidosDistribuidorService, private readonly operaciones: OperacionesVentaService) {}

  @Get('modalidades')
  modalidades() { return { flujoCaja: true, modalidades: ['PAGO_ANTES','COBRO_POSTERIOR'] }; }

  @Post(':id/entregar')
  @Roles('CAJERO','ADMIN_EMPRESA','GERENTE')
  entregar(@Param('id') id:string,@Body() body:any,@Request() req:any) { return this.service.entregar(+id,body,req.user); }

  @Post(':id/conciliar-credito-historico')
  @Roles('ADMIN_EMPRESA','GERENTE')
  conciliarCreditoHistorico(@Param('id') id:string,@Body() body:any,@Request() req:any) { return this.service.conciliarCreditoHistorico(+id,body,req.user); }

  @Post(':id/cobrar')
  @Roles('CAJERO','ADMIN_EMPRESA','GERENTE')
  async cobrar(@Param('id') id:string,@Body() body:CobroCredito,@Request() req:any) {
    const pedido=await this.service.obtener(+id,req.user.empresaId,undefined,req.user.rol==='CAJERO'?(req.user.sucursalId || -1):undefined);
    if(!pedido.pedidoCajaId) throw new ForbiddenException('Este pedido no tiene una entrega de caja registrada.');
    return this.operaciones.cobrar(pedido.pedidoCajaId,body,req.user);
  }

  @Post()
  @Roles('DISTRIBUIDOR')
  crear(@Body() body: any, @Request() req: any) {
    if (!req.user.distribuidorId) throw new ForbiddenException('Esta cuenta no tiene un perfil de distribuidor');
    return this.service.crearPedido(body, req.user.distribuidorId, req.user.sucursalId, req.user.empresaId, req.user.id);
  }

  @Get()
  listar(@Request() req: any, @Query('distribuidorId') distribuidorId?: string) {
    if(req.user.rol==='DISTRIBUIDOR'&&!req.user.distribuidorId) throw new ForbiddenException('No tienes un perfil de distribuidor.');
    // El distribuidor solo puede ver los suyos, sin importar qué pida por query.
    const filtro = req.user.rol === 'DISTRIBUIDOR' ? req.user.distribuidorId : (distribuidorId ? +distribuidorId : undefined);
    return this.service.listar(req.user.empresaId, filtro, req.user.rol==='CAJERO'?(req.user.sucursalId || -1):undefined);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Request() req: any) {
    if(req.user.rol==='DISTRIBUIDOR'&&!req.user.distribuidorId) throw new ForbiddenException('No tienes un perfil de distribuidor.');
    const propio = req.user.rol === 'DISTRIBUIDOR' ? req.user.distribuidorId : undefined;
    return this.service.obtener(+id, req.user.empresaId, propio, req.user.rol==='CAJERO'?(req.user.sucursalId || -1):undefined);
  }

  @Patch(':id/anular')
  @Roles('DISTRIBUIDOR','ADMIN_EMPRESA','GERENTE')
  anular(@Param('id') id: string, @Request() req: any) {
    if(req.user.rol==='DISTRIBUIDOR'&&!req.user.distribuidorId) throw new ForbiddenException('No tienes un perfil de distribuidor.');
    const propio = req.user.rol === 'DISTRIBUIDOR' ? req.user.distribuidorId : undefined;
    return this.service.anular(+id, req.user.empresaId, req.user.id, propio);
  }
}
