import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { SucursalesService } from './sucursales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly sucursalesService: SucursalesService) {}

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    this.validarAdministrador(req);
    return this.sucursalesService.crear(body, req.user.empresaId, req.user.sucursalId);
  }

  private validarAdministrador(req: any) {
    if (!['ADMIN_EMPRESA','GERENTE'].includes(req.user.rol)) throw new ForbiddenException('Solo un administrador o gerente puede administrar sedes');
  }

  @Post(':id/preparar-base')
  preparar(@Param('id') id: string, @Request() req: any) {
    this.validarAdministrador(req);
    return this.sucursalesService.preparar(+id,req.user.empresaId,req.user.sucursalId);
  }

  @Get()
  listar(@Request() req: any, @Query('incluirInactivas') incluirInactivas?: string) {
    return this.sucursalesService.listar(req.user.empresaId, incluirInactivas === 'true');
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    this.validarAdministrador(req);
    return this.sucursalesService.actualizar(+id, req.user.empresaId, body);
  }

  @Patch(':id/toggle-activo')
  toggleActivo(@Param('id') id: string, @Request() req: any) {
    this.validarAdministrador(req);
    return this.sucursalesService.toggleActivo(+id, req.user.empresaId);
  }
}
