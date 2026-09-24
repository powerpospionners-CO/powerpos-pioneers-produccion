import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CatalogoService } from './catalogo.service';

// Sin JwtAuthGuard: el admin comparte este enlace con distribuidores/clientes
// para que vean o descarguen el catálogo, sin necesidad de iniciar sesión.
@Controller('catalogo-publico')
export class CatalogoPublicoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  @Get(':slug')
  ver(@Param('slug') slug: string) {
    return this.catalogoService.catalogoPublico(slug);
  }

  @Get(':slug/pdf')
  async pdf(@Param('slug') slug: string, @Res() res: Response) {
    const buffer = await this.catalogoService.generarPDFPublico(slug);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="catalogo.pdf"');
    res.send(buffer);
  }
}
