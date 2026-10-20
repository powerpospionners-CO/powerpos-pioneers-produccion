import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
export class NotificacionesController {
  constructor(private readonly servicio: NotificacionesService) {}

  @Get('configuracion')
  configuracion(@Request() req: any) {
    return this.servicio.configuracion(req.user.empresaId);
  }

  @Patch('administradores/:id')
  guardar(
    @Param('id') id: string,
    @Body() datos: unknown,
    @Request() req: any,
  ) {
    return this.servicio.guardarPreferencias(
      Number(id),
      datos,
      req.user.empresaId,
      req.user.id,
    );
  }

  @Post('administradores/:id/prueba')
  prueba(@Param('id') id: string, @Request() req: any) {
    return this.servicio.probarCorreo(Number(id), req.user.empresaId);
  }
}
