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
  Res,
  UseGuards,
} from '@nestjs/common';
import { CategoriaMovimiento } from '@prisma/client';
import type { Response } from 'express';
import { AntiguedadService } from './antiguedad.service';
import { OrdenesCompraService } from './ordenes-compra.service';
import type { OrdenInput, RecepcionInput } from './ordenes-compra.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdministracionGuard } from './administracion.guard';
import { AdministracionService } from './administracion.service';
import { GastosRecurrentesService } from './gastos-recurrentes.service';
import type { GastoRecurrenteInput } from './gastos-recurrentes.service';
import { ConteosService } from './conteos.service';
import type { ConteoInput } from './conteos.service';
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
  constructor(
    private readonly service: AdministracionService,
    private readonly recurrentes: GastosRecurrentesService,
    private readonly conteos: ConteosService,
    private readonly antiguedad: AntiguedadService,
    private readonly ordenes: OrdenesCompraService,
  ) {}
  @Get('ordenes') listarOrdenes(@Request() req: { user: ActorAdministrativo }) { return this.ordenes.listar(req.user.empresaId); }
  @Post('ordenes') crearOrden(@Body() datos: OrdenInput, @Request() req: { user: ActorAdministrativo }) { return this.ordenes.crear(datos, req.user); }
  @Post('ordenes/:id/resolver') @Roles('ADMIN_EMPRESA') resolverOrden(@Param('id', ParseIntPipe) id: number, @Body() datos: { aprobar: boolean; motivo: string }, @Request() req: { user: ActorAdministrativo }) { return this.ordenes.resolver(id, datos.aprobar, datos.motivo, req.user); }
  @Post('ordenes/:id/recibir') recibirOrden(@Param('id', ParseIntPipe) id: number, @Body() datos: RecepcionInput, @Request() req: { user: ActorAdministrativo }) { return this.ordenes.recibir(id, datos, req.user); }
  @Get('antiguedad') consultarAntiguedad(@Request() req: { user: ActorAdministrativo }) {
    return this.antiguedad.consultar(req.user.empresaId);
  }
  @Get('antiguedad/exportar') async exportarAntiguedad(@Request() req: { user: ActorAdministrativo }, @Res() res: Response) {
    const buffer = await this.antiguedad.exportar(req.user.empresaId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="antiguedad-cuentas.xlsx"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
  @Get('conteos') listarConteos(@Request() req: { user: ActorAdministrativo }) {
    return this.conteos.listar(req.user.empresaId);
  }
  @Post('conteos') crearConteo(
    @Body() datos: ConteoInput,
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.conteos.crear(datos, req.user);
  }
  @Post('conteos/:id/resolver') @Roles('ADMIN_EMPRESA') resolverConteo(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: { aprobar: boolean; motivo: string },
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.conteos.resolver(id, datos.aprobar, datos.motivo, req.user);
  }
  @Get('recurrentes') listarRecurrentes(
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.recurrentes.listar(req.user.empresaId);
  }
  @Post('recurrentes') @Roles('ADMIN_EMPRESA') crearRecurrente(
    @Body() datos: GastoRecurrenteInput,
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.recurrentes.crear(datos, req.user);
  }
  @Patch('recurrentes/:id') @Roles('ADMIN_EMPRESA') editarRecurrente(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    datos: { monto?: number; diaVencimiento?: number; activo?: boolean },
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.recurrentes.editar(id, datos, req.user);
  }
  @Post('recurrentes/:id/generar') @Roles('ADMIN_EMPRESA') generarRecurrente(
    @Param('id', ParseIntPipe) id: number,
    @Body() datos: { periodo: string },
    @Request() req: { user: ActorAdministrativo },
  ) {
    return this.recurrentes.generar(id, datos.periodo, req.user);
  }
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
