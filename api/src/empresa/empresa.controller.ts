import { BadRequestException, Controller, Get, Patch, Post, Body, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { promises as fs } from 'fs';
import * as sharpModule from 'sharp';
const sharp = sharpModule as unknown as typeof sharpModule.default;
import { EmpresaService } from './empresa.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { directorioUploads } from '../storage/uploads';
import { analizarLogo } from './paleta-logo';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('empresa')
export class EmpresaController {
  constructor(private readonly empresaService: EmpresaService) {}

  @Get()
  obtener(@Request() req: any) {
    return this.empresaService.obtener(req.user.empresaId);
  }

  @Patch()
  @Roles('ADMIN_EMPRESA')
  actualizar(@Body() body: any, @Request() req: any) {
    return this.empresaService.actualizar(req.user.empresaId, body);
  }

  @Post('logo')
  @Roles('ADMIN_EMPRESA')
  @UseInterceptors(FileInterceptor('logo', {
    storage: diskStorage({
      destination: directorioUploads('logos'),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `logo-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
        cb(new Error('Solo se permiten imágenes'), false);
      } else {
        cb(null, true);
      }
    },
    limits: { fileSize: 8 * 1024 * 1024 },
  }))
  async subirLogo(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('Selecciona una imagen de logo');
    // El logo se descarga y procesa en cada impresión de recibo (ver
    // impresion.service.ts); una foto subida a resolución completa (varios
    // MB) vuelve esa descarga lenta y puede llegar a tumbar la conexión con
    // el agente de impresión. Se reduce aquí, una sola vez, al subirla.
    let paleta: Awaited<ReturnType<typeof analizarLogo>>;
    try {
      const reducido = await sharp(file.path, { limitInputPixels: 25000000 })
        .rotate()
        .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
        .toBuffer();
      paleta = await analizarLogo(reducido);
      await fs.writeFile(file.path, reducido);
    } catch {
      await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException('No se pudo analizar el logo. Usa una imagen PNG, JPG o WebP válida.');
    }
    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const logoUrl = `${baseUrl}/uploads/logos/${file.filename}`;
    await this.empresaService.actualizarLogo(req.user.empresaId, logoUrl, paleta);
    return { logoUrl, paleta };
  }

  @Post('agente-impresion/token')
  @Roles('ADMIN_EMPRESA')
  generarTokenAgenteImpresion(@Request() req: any) {
    return this.empresaService.generarTokenAgenteImpresion(req.user.empresaId);
  }

  @Post('anuncios/imagen')
  @Roles('ADMIN_EMPRESA')
  @UseInterceptors(FileInterceptor('imagen', {
    storage: diskStorage({
      destination: directorioUploads('anuncios'),
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `anuncio-${uniqueSuffix}${extname(file.originalname)}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
        cb(new Error('Solo se permiten imágenes'), false);
      } else {
        cb(null, true);
      }
    },
    limits: { fileSize: 8 * 1024 * 1024 },
  }))
  subirImagenAnuncio(@UploadedFile() file: Express.Multer.File) {
    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    return { imagen: `${baseUrl}/uploads/anuncios/${file.filename}` };
  }

  @Patch('anuncios')
  @Roles('ADMIN_EMPRESA')
  actualizarAnuncios(@Body() body: any, @Request() req: any) {
    return this.empresaService.actualizarAnuncios(req.user.empresaId, body.anuncios);
  }
}
