import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { CategoriaMovimiento } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ComprasService } from './compras.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('compras')
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get('saldo')
  obtenerSaldo(@Request() req: any) {
    return this.compras.obtenerSaldo(req.user.empresaId);
  }

  @Post('saldo-inicial')
  @Roles('ADMIN_EMPRESA')
  configurarSaldoInicial(@Body() body: { monto: number }, @Request() req: any) {
    return this.compras.configurarSaldoInicial(body.monto, req.user.empresaId, req.user.id);
  }

  @Post()
  registrar(
    @Body() body: {
      categoria: CategoriaMovimiento;
      descripcion: string;
      monto?: number;
      fecha?: string;
      proveedorId?: number;
      condicionPago?: 'CONTADO' | 'CREDITO';
      documento?: string;
      vencimiento?: string;
      items?: { productoId: number; presentacionId?: number | null; cantidad: number; costoUnitario: number }[];
    },
    @Request() req: any,
  ) {
    return this.compras.registrar(
      body,
      req.user.id,
      req.user.empresaId,
      req.user.sucursalId || 1,
    );
  }

  @Get()
  listar(@Request() req: any, @Query('fechaDesde') fechaDesde?: string, @Query('fechaHasta') fechaHasta?: string) {
    return this.compras.listar(req.user.empresaId, fechaDesde, fechaHasta);
  }
}
