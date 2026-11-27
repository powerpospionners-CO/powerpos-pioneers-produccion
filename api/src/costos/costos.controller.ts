import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CostosService } from './costos.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('costos')
export class CostosController {
  constructor(private readonly costos: CostosService) {}

  @Get('kardex')
  kardex(@Request() req: any, @Query() q: any) {
    return this.costos.kardex(req.user.empresaId, q.tipo, q.id, q.desde, q.hasta);
  }

  @Get('platos')
  platos(@Request() req: any, @Query() q: any) {
    return this.costos.platos(req.user.empresaId, q.dias, q.umbral);
  }

  @Get('sugerencia-compra')
  sugerencia(@Request() req: any, @Query() q: any) {
    return this.costos.sugerencia(req.user.empresaId, q.dias, q.cobertura);
  }
}
