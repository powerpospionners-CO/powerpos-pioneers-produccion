import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ConsumoEmpleadosService } from './consumo-empleados.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('consumo-empleados')
export class ConsumoEmpleadosController {
  constructor(private readonly consumoEmpleadosService: ConsumoEmpleadosService) {}

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    return this.consumoEmpleadosService.crear(body, req.user.id, req.user.empresaId);
  }

  @Get()
  listar(@Request() req: any, @Query('sucursalId') sucursalId?: string) {
    return this.consumoEmpleadosService.listar(req.user.empresaId, sucursalId ? +sucursalId : undefined);
  }

  @Get('resumen')
  resumen(@Request() req: any) {
    return this.consumoEmpleadosService.resumenDelMes(req.user.empresaId);
  }
}
