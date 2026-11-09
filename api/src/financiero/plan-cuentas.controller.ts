import { Body, Controller, Delete, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlanCuentasService } from './plan-cuentas.service';
import { EstadosFinancierosService } from './estados-financieros.service';
import { prepararInformePuc } from './plan-cuentas.informe';
import { PrismaService } from '../prisma/prisma.service';

@Controller('financiero/puc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
export class PlanCuentasController {
  constructor(private readonly plan: PlanCuentasService, private readonly estados: EstadosFinancierosService, private readonly prisma: PrismaService) {}

  @Get('cuentas')
  cuentas(@Request() req: any) { return this.plan.catalogo(req.user.empresaId); }

  @Post('cuentas')
  guardar(@Request() req: any, @Body() datos: { codigo?: unknown; nombre?: unknown; activo?: unknown; crear?: unknown }) {
    return this.plan.guardar(req.user.empresaId, req.user.id, datos);
  }

  @Post('asignar')
  asignar(@Request() req: any, @Body() datos: { origen?: unknown; registroId?: unknown; codigo?: unknown }) {
    return this.plan.asignar(req.user.empresaId, req.user.id, datos);
  }

  @Delete('cuentas/:codigo')
  eliminar(@Request() req: any, @Param('codigo') codigo: string) {
    return this.plan.eliminar(req.user.empresaId, req.user.id, codigo);
  }

  @Get('informe')
  async informe(@Request() req: any, @Query('fechaDesde') desde?: string, @Query('fechaHasta') hasta?: string) {
    const [cuentas, estados, asignaciones, empresa] = await Promise.all([
      this.plan.catalogo(req.user.empresaId),
      this.estados.obtener(req.user.empresaId, desde, hasta, true),
      this.prisma.asignacionPuc.findMany({ where: { empresaId: req.user.empresaId } }),
      this.prisma.empresa.findUnique({ where: { id: req.user.empresaId }, select: { tipoNegocio: true } }),
    ]);
    return prepararInformePuc(estados, cuentas, asignaciones, empresa?.tipoNegocio === 'RESTAURANTE');
  }
}
