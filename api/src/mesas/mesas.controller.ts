import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MesasService } from './mesas.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('mesas')
export class MesasController {
  constructor(private readonly mesas: MesasService) {}

  @Get()
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  estado(@Request() req: any) { return this.mesas.estado(req.user); }

  @Put('plano')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  plano(@Request() req: any, @Body() body: any) { return this.mesas.guardarPlano(req.user, body); }

  @Get('cocina')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO', 'COCINERO')
  cocina(@Request() req: any) { return this.mesas.cocina(req.user); }

  @Post(':numero/abrir')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  abrir(@Request() req: any, @Param('numero') numero: string, @Body() body: any) { return this.mesas.abrir(req.user, numero, body?.personas); }

  @Get('cuentas/:id')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  ver(@Request() req: any, @Param('id') id: string) { return this.mesas.ver(req.user, id); }

  @Post('cuentas/:id/items')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  agregar(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.mesas.agregar(req.user, id, body?.items); }

  @Delete('cuentas/:id/items/:linea')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  quitar(@Request() req: any, @Param('id') id: string, @Param('linea') linea: string, @Body() body: any) { return this.mesas.quitar(req.user, id, linea, body?.motivo); }

  @Post('cuentas/:id/enviar')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  enviar(@Request() req: any, @Param('id') id: string) { return this.mesas.enviar(req.user, id); }

  @Patch('cuentas/:id/rondas/:n')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO', 'COCINERO')
  ronda(@Request() req: any, @Param('id') id: string, @Param('n') n: string, @Body() body: any) { return this.mesas.estadoRonda(req.user, id, n, body?.estado); }

  @Post('cuentas/:id/trasladar')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  trasladar(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.mesas.trasladar(req.user, id, body?.mesa); }

  @Post('cuentas/:id/mover')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  mover(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.mesas.moverLineas(req.user, id, body?.lineas, body?.mesa); }

  @Post('cuentas/:id/anular')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  anular(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.mesas.anular(req.user, id, body?.motivo); }

  @Post('cuentas/:id/cobrar')
  @Roles('ADMIN_EMPRESA', 'GERENTE', 'CAJERO')
  cobrar(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.mesas.cobrar(req.user, id, body); }
}
