import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CategoriaMovimiento } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdministracionGuard } from './administracion.guard';
import { AdministracionService } from './administracion.service';
import type {
  AbonoInput,
  ActorAdministrativo,
  CuentaInput,
  ProveedorInput,
} from './administracion.service';

@Controller('administracion')
@UseGuards(JwtAuthGuard, RolesGuard, AdministracionGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
export class AdministracionController {
  constructor(private readonly service: AdministracionService) {}
  @Get('resumen') resumen(@Request() req: { user: ActorAdministrativo }) {
    return this.service.resumen(req.user.empresaId);
  }
  @Get('proveedores') proveedores(
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.proveedores(req.user.empresaId);
  }
  @Post('proveedores') crearProveedor(
    @Body() datos: ProveedorInput,
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.crearProveedor(datos, req.user);
  }
  @Patch('proveedores/:id') estadoProveedor(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: { activo: boolean },
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.estadoProveedor(id, datos.activo, req.user);
  }
  @Get('cuentas') cuentas(
    @Query('tipo') tipo: string,
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.cuentas(req.user.empresaId, tipo);
  }
  @Post('cuentas') crearCuenta(
    @Body() datos: CuentaInput,
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.crearCuenta(datos, req.user);
  }
  @Post('cuentas/:id/abonos') abonar(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: AbonoInput,
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.abonar(id, datos, req.user);
  }
  @Post('cuentas/:id/anular') @Roles('ADMIN_EMPRESA') anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: { motivo: string },
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.anularCuenta(id, datos.motivo, req.user);
  }
  @Get('movimientos') movimientos(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.movimientos(req.user.empresaId, desde, hasta);
  }
  @Post('movimientos/:id/conciliar') conciliar(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: { referencia: string; fechaBanco: string },
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.conciliar(id, datos, req.user);
  }
  @Get('presupuestos') presupuesto(
    @Query('periodo') periodo: string,
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.presupuesto(periodo, req.user.empresaId);
  }
  @Post('presupuestos') @Roles('ADMIN_EMPRESA') guardarPresupuesto(
    @Body()
    datos: { periodo: string; categoria: CategoriaMovimiento; monto: number },
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.service.guardarPresupuesto(datos, req.user);
  }
}
