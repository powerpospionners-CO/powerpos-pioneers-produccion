import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  crear(@Body() body: any, @Request() req: any) {
    return this.usuariosService.crear(body, req.user.empresaId);
  }

  @Get()
  listar(@Request() req: any) {
    return this.usuariosService.listar(req.user.empresaId);
  }

  @Get('mi-perfil')
  miPerfil(@Request() req: any) {
    return this.usuariosService.obtener(req.user.id, req.user.empresaId);
  }

  @Patch('mi-perfil')
  actualizarMiPerfil(@Body() body: any, @Request() req: any) {
    return this.usuariosService.actualizarPerfilPropio(req.user.id, body);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Request() req: any) {
    return this.usuariosService.obtener(+id, req.user.empresaId);
  }

  @Patch(':id')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.usuariosService.actualizar(+id, body, req.user.empresaId);
  }

  @Patch(':id/permisos')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  actualizarPermisos(@Param('id') id: string, @Body('permisos') permisos: any, @Request() req: any) {
    return this.usuariosService.actualizarPermisos(+id, permisos, req.user.empresaId);
  }

  @Patch(':id/toggle-activo')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  toggleActivo(@Param('id') id: string, @Request() req: any) {
    return this.usuariosService.toggleActivo(+id, req.user.empresaId);
  }
}