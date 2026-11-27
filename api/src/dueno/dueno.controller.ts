import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DuenoService } from './dueno.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('dueno')
export class DuenoController {
  constructor(private readonly dueno: DuenoService) {}

  @Get('resumen')
  resumen(@Request() req: any, @Query('fecha') fecha?: string) {
    return this.dueno.resumen(req.user, fecha);
  }

  @Get('control')
  control(@Request() req: any, @Query('desde') desde: string, @Query('hasta') hasta: string) {
    return this.dueno.control(req.user, desde, hasta);
  }
}
