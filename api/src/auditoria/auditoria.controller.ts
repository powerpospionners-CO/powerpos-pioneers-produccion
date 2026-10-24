import { BadRequestException, Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditoriaService } from './auditoria.service';

@Controller('auditoria')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}
  @Get()
  listar(@Request() req: any, @Query('antesDe') antesDe?: string, @Query('incluirConsultas') incluirConsultas?: string) {
    return this.auditoria.listarEmpresa(req.user.empresaId, antesDe, incluirConsultas !== 'false');
  }
}

@Controller('actividad')
@UseGuards(JwtAuthGuard)
export class ActividadController {
  @Post('vista')
  vista(@Body() body: any, @Request() req: any) {
    if (typeof body?.ruta !== 'string' || !/^\/[a-z0-9/-]{0,100}$/.test(body.ruta)) throw new BadRequestException('Pantalla no válida');
    req.auditoriaDetalle = { pantalla: body.ruta };
    return { registrado: true };
  }
  @Post('salir')
  salir() { return { registrado: true }; }
}
