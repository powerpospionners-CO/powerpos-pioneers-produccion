import { Body, Controller, Get, Patch, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PropinasService } from './propinas.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('propinas')
export class PropinasController {
  constructor(private readonly propinas: PropinasService) {}

  @Get('config')
  config(@Request() req: any) {
    return this.propinas.config(req.user.empresaId);
  }

  @Patch('config')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  guardar(@Request() req: any, @Body() body: any) {
    return this.propinas.guardarConfig(req.user, body);
  }

  @Get('reporte')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  reporte(@Request() req: any, @Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.propinas.reporte(req.user.empresaId, desde, hasta);
  }
}
