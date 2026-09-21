import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFile, Request, Query, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage, diskStorage } from 'multer';
import { extname } from 'path';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Post()
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  crear(@Body() body: any, @Request() req: any) {
    return this.productosService.crear(body, req.user.empresaId);
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
    return this.productosService.importarExcel(file.buffer, req.user.empresaId);
  }

  @Get()
  listar(@Request() req: any, @Query('categoriaId') categoriaId?: string) {
    return this.productosService.listar(req.user.empresaId, categoriaId ? +categoriaId : undefined);
  }

  @Post(':id/imagen')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  @UseInterceptors(FileInterceptor('imagen', {
    storage: diskStorage({
      destination: './uploads/productos',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `producto-${uniqueSuffix}${extname(file.originalname)}`);
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
    const imagen = `${baseUrl}/uploads/productos/${file.filename}`;
    await this.productosService.actualizarImagen(+id, req.user.empresaId, imagen);
    return { imagen };
  }

  @Get('alertas-stock')
  alertasStock(@Request() req: any) {
    return this.productosService.obtenerAlertasStock(req.user.empresaId);
  }

  @Get(':id')
  obtener(@Param('id') id: string, @Request() req: any) {
    return this.productosService.obtener(+id, req.user.empresaId);
  }

  @Get(':id/historial-stock')
  historialStock(@Param('id') id: string, @Request() req: any) {
    return this.productosService.obtenerHistorialStock(+id, req.user.empresaId);
  }

  @Post(':id/ajuste-stock')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  ajustarStock(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.productosService.ajustarStock(+id, body, req.user.id, req.user.empresaId);
  }

  @Patch(':id')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  actualizar(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.productosService.actualizar(+id, body, req.user.empresaId);
  }

  @Delete(':id')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  eliminar(@Param('id') id: string, @Request() req: any) {
    return this.productosService.eliminar(+id, req.user.empresaId);
  }
}
