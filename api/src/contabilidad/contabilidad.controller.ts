import { Controller, Get, Module, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContabilidadService } from './contabilidad.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('contabilidad')
export class ContabilidadController {
  constructor(private readonly contabilidad: ContabilidadService) {}

  @Get('libro-diario')
  libro(@Request() req: any, @Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.contabilidad.libroDiario(req.user.empresaId, desde, hasta);
  }
}

@Module({ controllers: [ContabilidadController], providers: [ContabilidadService, RolesGuard] })
export class ContabilidadModule {}
