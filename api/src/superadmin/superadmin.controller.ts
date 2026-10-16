import { Controller, Delete, Get, Param, Patch, Post, Body, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SuperadminService } from './superadmin.service';
import { PlanesService } from '../suscripciones/planes.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPERADMIN')
@Controller('superadmin')
export class SuperadminController {
  constructor(
    private readonly superadminService: SuperadminService,
    private readonly planesService: PlanesService,
  ) {}

  @Get('planes')
  planes() {
    return this.planesService.obtenerPrecios();
  }

  @Patch('planes')
  actualizarPlanes(
    @Body() body: {
      inicialMensual?: number;
      mediumMensual?: number;
      premiumMensual?: number;
      soporteMensual?: number;
      descuentoAnualMeses?: number;
    },
    @Request() req: any,
  ) {
    return this.planesService.actualizarPrecios(body, req.user.id);
  }

  @Get('resumen')
  resumen() {
    return this.superadminService.resumen();
  }

  @Get('empresas')
  empresas() {
    return this.superadminService.listarEmpresas();
  }

  @Get('auditoria')
  auditoria() {
    return this.superadminService.listarAuditoria();
  }

  @Post('empresas')
  crearEmpresa(@Body() body: any, @Request() req: any) {
    return this.superadminService.crearEmpresa(body, req.user.id);
  }

  @Patch('empresas/:id/estado')
  cambiarEstado(@Param('id') id: string, @Body() body: { activo: boolean }, @Request() req: any) {
    return this.superadminService.cambiarEstadoEmpresa(+id, body.activo, req.user.id);
  }

  @Patch('empresas/:id')
  editarEmpresa(@Param('id') id: string, @Body() body: { nombre: string; nit: string; email: string; telefono?: string; direccion?: string }, @Request() req: any) {
    return this.superadminService.editarEmpresa(+id, body, req.user.id);
  }

  @Get('empresas/:id/administradores')
  administradores(@Param('id') id: string) {
    return this.superadminService.listarAdministradores(+id);
  }

  @Post('empresas/:id/preparar-sedes')
  prepararSedes(@Param('id') id:string) {
    return this.superadminService.prepararSedesEmpresa(+id);
  }

  @Patch('administradores/:id')
  editarAdministrador(
    @Param('id') id: string,
    @Body() body: { nombre?: string; email?: string; password?: string; activo?: boolean },
    @Request() req: any,
  ) {
    return this.superadminService.editarAdministrador(+id, body, req.user.id);
  }

  @Delete('empresas/:id')
  eliminarEmpresa(@Param('id') id: string, @Request() req: any) {
    return this.superadminService.eliminarEmpresa(+id, req.user.id);
  }

  @Patch('empresas/:id/configuracion')
  actualizarConfiguracion(
    @Param('id') id: string,
    @Body() body: {
      plan?: 'BASICO' | 'MEDIUM' | 'PREMIUM';
      permisos?: Record<string, boolean>;
      modoPreparacion?: 'KDS' | 'COMANDAS';
      facturacionElectronicaHabilitada?: boolean;
      consumoEmpleadosHabilitado?: boolean;
      catalogoHabilitado?: boolean;
      distribuidoresHabilitado?: boolean;
      recaudoEfectivoHabilitado?: boolean;
      tipoNegocio?: 'RESTAURANTE' | 'SUPERMERCADO' | 'TIENDA' | 'COMERCIO';
    },
    @Request() req: any,
  ) {
    return this.superadminService.actualizarConfiguracion(+id, body, req.user.id);
  }

  @Patch('empresas/:id/suscripcion')
  actualizarSuscripcion(
    @Param('id') id: string,
    @Body() body: {
      pagoExonerado?: boolean;
      motivoExoneracion?: string | null;
      suscripcionVenceEn?: string | null;
      soporteIncluidoHasta?: string | null;
      soportePagadoHasta?: string | null;
    },
    @Request() req: any,
  ) {
    return this.planesService.actualizarEmpresa(+id, body, req.user.id);
  }
}
