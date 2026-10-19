import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { AdicionalesService } from './adicionales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('adicionales')
export class AdicionalesController {
  constructor(private readonly adicionalesService: AdicionalesService) {}

  private verificarAdministrador(req: any) {
    if (req.user.empresaId === 1 && req.user.rol !== 'ADMIN_EMPRESA')
      throw new ForbiddenException('Solo el administrador puede configurar los adicionales');
  }

  @Post('sincronizar-ingredientes')
  sincronizar(@Request() req: any) {
    this.verificarAdministrador(req);
    return this.adicionalesService.sincronizarIngredientes(req.user.empresaId);
  }

  @Get()
  listar(@Request() req: any, @Query('productoId') productoId?: string) {
    return this.adicionalesService.listar(
      req.user.empresaId,
      productoId ? +productoId : undefined,
    );
  }

  @Post()
  crear(@Body() body: any, @Request() req: any) {
    this.verificarAdministrador(req);
    return this.adicionalesService.crear(body, req.user.empresaId);
  }

  @Patch(':id')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    this.verificarAdministrador(req);
    return this.adicionalesService.actualizar(+id, body, req.user.empresaId);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @Request() req: any) {
    this.verificarAdministrador(req);
    return this.adicionalesService.eliminar(+id, req.user.empresaId);
  }
}
