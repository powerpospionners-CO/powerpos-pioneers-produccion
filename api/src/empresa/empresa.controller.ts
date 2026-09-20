import { Controller, Get, Patch, Post, Body, UseGuards, Request, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { EmpresaService } from './empresa.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

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
      destination: './uploads/logos',
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
    limits: { fileSize: 2 * 1024 * 1024 },
  }))
  async subirLogo(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const logoUrl = `${baseUrl}/uploads/logos/${file.filename}`;
    await this.empresaService.actualizarLogo(req.user.empresaId, logoUrl);
    return { logoUrl };
  }

  @Post('agente-impresion/token')
  @Roles('ADMIN_EMPRESA')
  generarTokenAgenteImpresion(@Request() req: any) {
    return this.empresaService.generarTokenAgenteImpresion(req.user.empresaId);
  }
}
