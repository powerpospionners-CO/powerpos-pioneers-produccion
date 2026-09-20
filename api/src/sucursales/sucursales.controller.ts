import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { SucursalesService } from './sucursales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('sucursales')
export class SucursalesController {
  constructor(private readonly sucursalesService: SucursalesService) {}

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    return this.sucursalesService.crear(body, req.user.empresaId);
  }

  @Get()
  listar(@Request() req: any, @Query('incluirInactivas') incluirInactivas?: string) {
    return this.sucursalesService.listar(req.user.empresaId, incluirInactivas === 'true');
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.sucursalesService.actualizar(+id, req.user.empresaId, body);
  }

  @Patch(':id/toggle-activo')
  toggleActivo(@Param('id') id: string, @Request() req: any) {
    return this.sucursalesService.toggleActivo(+id, req.user.empresaId);
  }
}