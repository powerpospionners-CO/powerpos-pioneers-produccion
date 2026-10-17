import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmpaquesService } from './empaques.service';

@Controller('inventario/empaques')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
export class EmpaquesController {
  constructor(private readonly servicio: EmpaquesService) {}
  @Get() listar(@Request() req: any) { return this.servicio.listar(req.user); }
  @Post('materias') crear(@Body() body: any, @Request() req: any) { return this.servicio.crearMateria(body, req.user); }
  @Post('movimientos') mover(@Body() body: any, @Request() req: any) { return this.servicio.moverMateria(body, req.user); }
  @Post() empacar(@Body() body: any, @Request() req: any) { return this.servicio.empacar(body, req.user); }
}
