import {
  Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors,
  UploadedFile, Request, Res, BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import { CatalogoService } from './catalogo.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalogo')
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  @Get()
  listar(@Request() req: any) {
    return this.catalogoService.listar(req.user.empresaId);
  }

  @Post()
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  crear(@Body() body: any, @Request() req: any) {
    return this.catalogoService.crear(body, req.user.empresaId);
  }

  @Post('importar')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  @UseInterceptors(FileInterceptor('archivo', {
    storage: memoryStorage(),
    fileFilter: (req, file, cb) => {
      const nombreValido = /\.(xlsx|xls)$/i.test(file.originalname);
      if (!nombreValido) {
        cb(new Error('Solo se permiten archivos Excel (.xlsx o .xls)'), false);
      } else {
        cb(null, true);
      }
    },
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  importar(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.catalogoService.importarExcel(file.buffer, req.user.empresaId);
  }

  @Get('pdf')
  async pdf(@Request() req: any, @Res() res: Response) {
    const buffer = await this.catalogoService.generarPDF(req.user.empresaId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="catalogo.pdf"');
    res.send(buffer);
  }

  @Post(':id/imagen')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  @UseInterceptors(FileInterceptor('imagen', {
    storage: diskStorage({
      destination: './uploads/catalogo',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `catalogo-${uniqueSuffix}${extname(file.originalname)}`);
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
  async subirImagen(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('No se recibió ninguna imagen');
    const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const imagen = `${baseUrl}/uploads/catalogo/${file.filename}`;
    await this.catalogoService.actualizarImagen(+id, req.user.empresaId, imagen);
    return { imagen };
  }

  @Patch(':id')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.catalogoService.actualizar(+id, body, req.user.empresaId);
  }

  @Delete(':id')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  eliminar(@Param('id') id: string, @Request() req: any) {
    return this.catalogoService.eliminar(+id, req.user.empresaId);
  }
}
