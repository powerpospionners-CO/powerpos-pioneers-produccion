import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { InventarioService } from './inventario.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventarioService: InventarioService) {}

  @Get()
  listar(@Query('incluirInactivos') incluirInactivos: string, @Request() req: any) {
    return this.inventarioService.listarIngredientes(req.user.empresaId, incluirInactivos === 'true');
  }

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    return this.inventarioService.crearIngrediente(body, req.user.id, req.user.empresaId);
  }

  @Get('alertas')
  alertas(@Request() req: any) {
    return this.inventarioService.obtenerAlertas(req.user.empresaId);
  }

  @Get(':id/historial')
  historial(@Param('id') id: string, @Request() req: any) {
    return this.inventarioService.obtenerHistorial(+id, req.user.empresaId);
  }

  @Post(':id/ajuste')
  ajustar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.inventarioService.ajustarStock(+id, body, req.user.id, req.user.empresaId);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.inventarioService.actualizarIngrediente(+id, body, req.user.empresaId);
  }

  @Patch(':id/toggle-activo')
  toggleActivo(@Param('id') id: string, @Request() req: any) {
    return this.inventarioService.toggleActivo(+id, req.user.empresaId);
  }
}
