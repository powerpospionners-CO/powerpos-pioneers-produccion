import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Post()
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
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.usuariosService.actualizar(+id, body, req.user.empresaId);
  }

  @Patch(':id/permisos')
  actualizarPermisos(@Param('id') id: string, @Body('permisos') permisos: any, @Request() req: any) {
    return this.usuariosService.actualizarPermisos(+id, permisos, req.user.empresaId);
  }

  @Patch(':id/toggle-activo')
  toggleActivo(@Param('id') id: string, @Request() req: any) {
    return this.usuariosService.toggleActivo(+id, req.user.empresaId);
  }
}