import { Body, Controller, Get, Global, Module, Patch, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IvaService } from './iva.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA', 'GERENTE')
@Controller('iva')
export class IvaController {
  constructor(private readonly iva: IvaService) {}

  @Get('tarifas')
  tarifas(@Request() req: any) { return this.iva.resumen(req.user.empresaId); }

  @Patch('tarifas')
  @Roles('ADMIN_EMPRESA')
  guardar(@Request() req: any, @Body() body: any) { return this.iva.guardar(req.user.empresaId, req.user.id, body); }

  @Get('reporte')
  reporte(@Request() req: any, @Query('desde') desde: string, @Query('hasta') hasta: string) { return this.iva.reporte(req.user.empresaId, desde, hasta); }
}

@Global()
@Module({ controllers: [IvaController], providers: [IvaService, RolesGuard], exports: [IvaService] })
export class IvaModule {}
