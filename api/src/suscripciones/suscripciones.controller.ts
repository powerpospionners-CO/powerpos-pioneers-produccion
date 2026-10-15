import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { PeriodicidadPlan } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PlanesService } from './planes.service';

@Controller('suscripciones')
export class SuscripcionesController {
  constructor(private readonly planes: PlanesService) {}

  @Get('precios')
  precios() {
    return this.planes.obtenerPrecios();
  }

  @Get('estado')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_EMPRESA')
  estado(@Request() req: any) {
    return this.planes.estado(req.user.empresaId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN_EMPRESA')
  checkout(
    @Body() body: { periodicidad: PeriodicidadPlan; incluyeSoporte?: boolean },
    @Request() req: any,
  ) {
    return this.planes.crearCheckout(
      req.user.empresaId,
      req.user.email,
      body.periodicidad,
      body.incluyeSoporte === true,
    );
  }

  @Post('wompi/eventos')
  procesarEvento(@Body() body: any) {
    return this.planes.procesarEventoWompi(body);
  }
}
