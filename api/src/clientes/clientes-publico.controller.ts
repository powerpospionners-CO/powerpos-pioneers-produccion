import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ClientesService } from './clientes.service';

// Sin JwtAuthGuard: esta es la puerta pública para que un cliente se
// autorregistre escaneando el código QR de su empresa. No expone datos de
// otros clientes, solo permite crear el suyo propio.
@Controller('registro-clientes')
export class ClientesPublicoController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get(':slug')
  info(@Param('slug') slug: string) {
    return this.clientesService.infoPublica(slug);
  }

  @Post(':slug')
  registrar(@Param('slug') slug: string, @Body() body: any) {
    return this.clientesService.crearPublico(slug, body);
  }
}
