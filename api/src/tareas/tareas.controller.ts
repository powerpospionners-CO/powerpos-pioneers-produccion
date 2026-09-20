import { Controller, Post, UseGuards } from '@nestjs/common';
import { TareasService } from './tareas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tareas')
export class TareasController {
  constructor(private readonly tareasService: TareasService) {}

  @Post('probar-cumpleanos')
  probarCumpleanos() {
    return this.tareasService.notificarCumpleanosDeHoy();
  }
}