import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { CategoriasService } from './categorias.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    return this.categoriasService.crear(body, req.user.empresaId);
  }

  @Get()
  listar(@Request() req: any) {
    return this.categoriasService.listar(req.user.empresaId);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.categoriasService.actualizar(+id, body, req.user.empresaId);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @Request() req: any) {
    return this.categoriasService.eliminar(+id, req.user.empresaId);
  }
}