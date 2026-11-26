import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Query,
  HttpCode,
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
import { BoldService } from './bold.service';
import { TiendaExtrasService } from './tienda-extras.service';
import { TiendaExperienciaService } from './tienda-experiencia.service';
import { LimitePublico, LimitePublicoGuard } from './limite-publico.guard';

@Controller('tiendas')
export class TiendaPublicaController {
  constructor(private service: TiendaService, private extras: TiendaExtrasService, private experiencia: TiendaExperienciaService) {}
  @Get(':slug/cuenta/extras')
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-extras', 120)
  cuentaExtras(@Param('slug') slug: string, @Headers('authorization') auth?: string) {
    return this.experiencia.resumenCuenta(slug, auth);
  }
  @Post(':slug/cuenta/vincular')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-vincular', 10)
  vincular(@Param('slug') slug: string, @Body() body: any, @Headers('authorization') auth?: string) {
    return this.experiencia.vincular(slug, auth, body);
  }
  @Post(':slug/cuenta/favoritos')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-favoritos', 60)
  favorito(@Param('slug') slug: string, @Body() body: any, @Headers('authorization') auth?: string) {
    return this.experiencia.favorito(slug, auth, body);
  }
  @Post(':slug/cuenta/resenas')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-resenas', 20)
  resena(@Param('slug') slug: string, @Body() body: any, @Headers('authorization') auth?: string) {
    return this.experiencia.crearResena(slug, auth, body);
  }
  @Get('mapa') mapa() { return this.service.mapaPublico(); }
  @Get(':slug') catalogo(@Param('slug') slug: string) {
    return this.service.catalogo(slug);
  }
  @Post(':slug/pedidos')
  @UseGuards(PedidosPublicosGuard)
  pedir(@Param('slug') slug: string, @Body() body: any, @Headers('authorization') auth?: string) {
    return this.service.solicitar(slug, body, auth);
  }
  @Post(':slug/cupones/validar')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cupon', 20)
  validarCupon(@Param('slug') slug: string, @Body() body: any) {
    return this.extras.validarCupon(slug, body);
  }
  @Post(':slug/reservas')
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('reserva', 5)
  reservar(@Param('slug') slug: string, @Body() body: any) {
    return this.extras.reservar(slug, body);
  }
  @Get(':slug/reservas/:id')
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('reserva-consulta', 120)
  reserva(@Param('slug') slug: string, @Param('id') id: string) {
    return this.extras.reserva(slug, id);
  }
  @Post(':slug/boletin')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('boletin', 5)
  suscribir(@Param('slug') slug: string, @Body() body: any) {
    return this.extras.suscribir(slug, body);
  }
  @Post(':slug/boletin/baja')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('boletin-baja', 5)
  baja(@Param('slug') slug: string, @Body() body: any) {
    return this.extras.bajaBoletin(slug, body);
  }
  @Post(':slug/cuenta/registro')
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-registro', 5, 3600000)
  registrar(@Param('slug') slug: string, @Body() body: any) {
    return this.extras.registrar(slug, body);
  }
  @Post(':slug/cuenta/ingresar')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-ingreso', 10)
  ingresar(@Param('slug') slug: string, @Body() body: any) {
    return this.extras.ingresar(slug, body);
  }
  @Post(':slug/cuenta/codigo')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-codigo', 3)
  codigo(@Param('slug') slug: string, @Body() body: any) {
    return this.extras.solicitarCodigo(slug, body);
  }
  @Post(':slug/cuenta/restablecer')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-restablecer', 10)
  restablecer(@Param('slug') slug: string, @Body() body: any) {
    return this.extras.restablecer(slug, body);
  }
  @Get(':slug/cuenta')
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta', 120)
  perfil(@Param('slug') slug: string, @Headers('authorization') auth?: string) {
    return this.extras.perfil(slug, auth);
  }
  @Patch(':slug/cuenta')
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-edicion', 20)
  editarPerfil(@Param('slug') slug: string, @Body() body: any, @Headers('authorization') auth?: string) {
    return this.extras.actualizarPerfil(slug, auth, body);
  }
  @Post(':slug/cuenta/contrasena')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-contrasena', 10)
  contrasena(@Param('slug') slug: string, @Body() body: any, @Headers('authorization') auth?: string) {
    return this.extras.cambiarContrasena(slug, auth, body);
  }
  @Post(':slug/cuenta/cerrar-sesiones')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-sesiones', 10)
  cerrarSesiones(@Param('slug') slug: string, @Headers('authorization') auth?: string) {
    return this.extras.cerrarSesiones(slug, auth);
  }
  @Post(':slug/cuenta/eliminar')
  @HttpCode(200)
  @UseGuards(LimitePublicoGuard)
  @LimitePublico('cuenta-eliminar', 5)
  eliminarCuenta(@Param('slug') slug: string, @Body() body: any, @Headers('authorization') auth?: string) {
    return this.extras.eliminarCuenta(slug, auth, body);
  }
  @Post(':slug/pedidos/:id/bold')
  @UseGuards(PedidosPublicosGuard)
  pago(@Param('slug') slug: string, @Param('id') id: string, @Body() body: any) {
    return this.service.pagoBold(slug, id, body?.clave);
  }
  @Post(':slug/bold/webhook')
  @HttpCode(200)
  webhook(@Param('slug') slug: string, @Request() req: any) {
    return this.service.webhookBold(slug, req.rawBody, req.headers['x-bold-signature']);
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
  constructor(private service: TiendaService, private bold: BoldService, private extras: TiendaExtrasService, private experiencia: TiendaExperienciaService) {}
  @Get('mesas')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  mesas(@Request() req: any) { return this.experiencia.mesas(req.user); }
  @Post('clientes-pos/:id/codigo-web')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  codigoWeb(@Request() req: any, @Param('id') id: string) { return this.experiencia.codigoVinculo(req.user, Number(id)); }
  @Get('resenas')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  resenas(@Request() req: any) { return this.experiencia.resenasAdmin(req.user); }
  @Patch('resenas/:id')
  @Roles('ADMIN_EMPRESA')
  moderar(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.experiencia.moderarResena(req.user, id, body); }
  @Get('estadisticas')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  estadisticas(@Request() req: any, @Query('dias') dias: string) { return this.experiencia.estadisticas(req.user, dias); }
  @Get('cupones')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  cupones(@Request() req: any) { return this.extras.cupones(req.user); }
  @Post('cupones')
  @Roles('ADMIN_EMPRESA')
  crearCupon(@Request() req: any, @Body() body: any) { return this.extras.guardarCupon(req.user, body); }
  @Patch('cupones/:id')
  @Roles('ADMIN_EMPRESA')
  editarCupon(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.extras.guardarCupon(req.user, body, id); }
  @Delete('cupones/:id')
  @Roles('ADMIN_EMPRESA')
  eliminarCupon(@Request() req: any, @Param('id') id: string) { return this.extras.eliminarCupon(req.user, id); }
  @Get('reservas')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  reservas(@Request() req: any) { return this.extras.reservasAdmin(req.user); }
  @Patch('reservas/:id')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  async gestionarReserva(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    const r = await this.extras.gestionarReserva(req.user, id, body);
    void this.experiencia.avisarReserva(req.user.empresaId, id);
    return r;
  }
  @Get('suscriptores')
  @Roles('ADMIN_EMPRESA')
  suscriptores(@Request() req: any) { return this.extras.suscriptores(req.user); }
  @Delete('suscriptores/:id')
  @Roles('ADMIN_EMPRESA')
  eliminarSuscriptor(@Request() req: any, @Param('id') id: string) { return this.extras.eliminarSuscriptor(req.user, id); }
  @Get('clientes-web')
  @Roles('ADMIN_EMPRESA')
  clientesWeb(@Request() req: any) { return this.extras.clientesAdmin(req.user); }
  @Delete('clientes-web/:id')
  @Roles('ADMIN_EMPRESA')
  eliminarClienteWeb(@Request() req: any, @Param('id') id: string) { return this.extras.eliminarClienteAdmin(req.user, id); }
  @Get('bold/configuracion')
  @Roles('ADMIN_EMPRESA')
  boldConfig(@Request() req: any) { return this.bold.configuracion(req.user); }
  @Patch('bold/configuracion')
  @Roles('ADMIN_EMPRESA')
  boldGuardar(@Request() req: any, @Body() body: any) { return this.bold.configurar(req.user, body); }
  @Get('bold/pagos')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  boldPagos(@Request() req: any) { return this.bold.pagos(req.user); }
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
