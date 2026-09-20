import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PreparacionesService } from './preparaciones.service';

@UseGuards(JwtAuthGuard)
@Controller('preparaciones')
export class PreparacionesController {
  constructor(private readonly preparacionesService: PreparacionesService) {}

  @Get()
  listar(@Request() req: any) {
    return this.preparacionesService.listar(req.user.empresaId);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Request() req: any) {
    return this.preparacionesService.obtener(+id, req.user.empresaId);
  }

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    return this.preparacionesService.crear(body, req.user.empresaId, req.user.id);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.preparacionesService.actualizar(+id, body, req.user.empresaId);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @Request() req: any) {
    return this.preparacionesService.eliminar(+id, req.user.empresaId);
  }

  @Get(':id/lotes')
  lotes(@Param('id') id: string, @Request() req: any) {
    return this.preparacionesService.listarLotes(+id, req.user.empresaId);
  }

  @Post(':id/lotes')
  crearLote(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.preparacionesService.crearLote(+id, body, req.user.empresaId, req.user.id);
  }
}
