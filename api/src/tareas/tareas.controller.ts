import { Controller, Post, Request, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TareasService } from './tareas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('tareas')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Post('probar-cumpleanos')
  probarCumpleanos(@Request() req: any) {
    return this.tareasService.notificarCumpleanosDeHoy(req.user.empresaId);
  }
}
