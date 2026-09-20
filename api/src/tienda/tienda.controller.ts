import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TiendaService } from './tienda.service';
import { PedidosPublicosGuard } from './pedidos-publicos.guard';

@Controller('tiendas')
export class TiendaPublicaController {
  constructor(private service: TiendaService) {}
  @Get(':slug') catalogo(@Param('slug') slug: string) {
    return this.service.catalogo(slug);
  }
  @Post(':slug/pedidos')
  @UseGuards(PedidosPublicosGuard)
  pedir(@Param('slug') slug: string, @Body() body: any) {
    return this.service.solicitar(slug, body);
  }
  @Get(':slug/pedidos/:id') seguimiento(
    @Param('slug') slug: string,
    @Param('id') id: string,
  ) {
    return this.service.seguimiento(slug, id);
  }
}
@Controller('tienda-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TiendaAdminController {
  @Get('resumen')
  @Roles('ADMIN_EMPRESA','GERENTE','CAJERO')
  resumen(@Request() req:any){return this.service.resumen(req.user);}
  constructor(private service: TiendaService) {}
  @Get('configuracion')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  config(@Request() req: any) {
    return this.service.configuracion(req.user.empresaId);
  }
  @Patch('configuracion')
  @Roles('ADMIN_EMPRESA')
  guardar(@Request() req: any, @Body() body: any) {
    return this.service.configurar(req.user.empresaId, body);
  }
  @Get('pedidos')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO', 'DOMICILIARIO')
  pedidos(@Request() req: any) {
    return this.service.listar(req.user);
  }
  @Get('repartidores')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  repartidores(@Request() req: any) {
    return this.service.repartidores(req.user);
  }
  @Patch('pedidos/:id')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO', 'DOMICILIARIO')
  gestionar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.service.gestionar(id, body, req.user);
  }
}
