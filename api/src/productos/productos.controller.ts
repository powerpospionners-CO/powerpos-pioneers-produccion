import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, UseInterceptors, UploadedFile, Request, Query, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage, diskStorage } from 'multer';
import { extname } from 'path';
import { ProductosService } from './productos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { directorioUploads } from '../storage/uploads';
import { OrigenesService, agregarOrigen } from './origenes.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService, private readonly origenes: OrigenesService) {}

  @Get('origenes')
  listarOrigenes(@Request() req: any) { return this.origenes.listar(req.user.empresaId); }
  @Post('origenes')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  crearOrigen(@Request() req: any, @Body() body: any) { return this.origenes.guardar(req.user.empresaId, body?.nombre); }
  @Patch('origenes/:origenId')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  editarOrigen(@Request() req: any, @Param('origenId') id: string, @Body() body: any) { return this.origenes.guardar(req.user.empresaId, body?.nombre, id); }
  @Patch(':id/origen')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  asignarOrigen(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.origenes.asignar(req.user.empresaId, +id, body?.origenId); }

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
  async listar(@Request() req: any, @Query('categoriaId') categoriaId?: string) {
    const [productos, origenes] = await Promise.all([this.productosService.listar(req.user.empresaId, categoriaId ? +categoriaId : undefined), this.origenes.listar(req.user.empresaId)]);
    return productos.map(p => agregarOrigen(p, origenes));
  }

  @Post(':id/imagen')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  @UseInterceptors(FileInterceptor('imagen', {
    storage: diskStorage({
      destination: directorioUploads('productos'),
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

  @Get('lotes/por-vencer')
  lotesPorVencer(@Request() req: any, @Query('dias') dias?: string) {
    return this.productosService.listarPorVencer(req.user.empresaId, dias ? +dias : 7);
  }

  @Get('reportes/merma')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  reporteMerma(@Request() req: any, @Query('desde') desde?: string, @Query('hasta') hasta?: string) {
    return this.productosService.reporteMerma(req.user.empresaId, desde, hasta);
  }

  @Get('exportar-excel')
  async exportarExcel(@Request() req: any, @Res() res: Response) {
    const buffer = await this.productosService.exportarExcel(req.user.empresaId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="productos.xlsx"');
    res.send(buffer);
  }

  @Get('comandas/configuracion')
  configuracionComandas(@Request() req: any) {
    return this.productosService.configuracionComandas(req.user.empresaId);
  }

  @Patch('comandas/configuracion')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  guardarComandas(@Body() datos: any, @Request() req: any) {
    return this.productosService.guardarComandas(datos?.cambios, req.user.empresaId, req.user.id);
  }

  @Get('historial-ventas')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  buscarHistorialVentas(@Request() req: any, @Query('nombre') nombre: string) {
    return this.productosService.buscarHistorialVentas(req.user.empresaId, nombre);
  }

  @Get(':id/historial-ventas')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  historialVentas(@Request() req: any, @Param('id') id: string) {
    return this.productosService.historialVentas(req.user.empresaId, +id);
  }

  @Get(':id')
  async obtener(@Param('id') id: string, @Request() req: any) {
    return agregarOrigen(await this.productosService.obtener(+id, req.user.empresaId), await this.origenes.listar(req.user.empresaId));
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

  @Post(':id/presentaciones')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  agregarPresentacion(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.productosService.agregarPresentacion(+id, body, req.user.empresaId);
  }

  @Patch(':id/presentaciones/:presentacionId')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  actualizarPresentacion(@Param('id') id: string, @Param('presentacionId') presentacionId: string, @Body() body: any, @Request() req: any) {
    return this.productosService.actualizarPresentacion(+id, +presentacionId, body, req.user.empresaId);
  }

  @Delete(':id/presentaciones/:presentacionId')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  eliminarPresentacion(@Param('id') id: string, @Param('presentacionId') presentacionId: string, @Request() req: any) {
    return this.productosService.eliminarPresentacion(+id, +presentacionId, req.user.empresaId);
  }

  @Post(':id/codigos-barras')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  agregarCodigoBarras(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.productosService.agregarCodigoBarras(+id, body, req.user.empresaId, req.user.id);
  }

  @Delete(':id/codigos-barras/:codigoId')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  eliminarCodigoBarras(@Param('id') id: string, @Param('codigoId') codigoId: string, @Request() req: any) {
    return this.productosService.eliminarCodigoBarras(+id, +codigoId, req.user.empresaId);
  }

  @Post(':id/combo-componentes')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  agregarComponenteCombo(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.productosService.agregarComponenteCombo(+id, body, req.user.empresaId);
  }

  @Patch(':id/combo-componentes/:componenteId')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  actualizarComponenteCombo(@Param('id') id: string, @Param('componenteId') componenteId: string, @Body() body: any, @Request() req: any) {
    return this.productosService.actualizarComponenteCombo(+id, +componenteId, body, req.user.empresaId);
  }

  @Delete(':id/combo-componentes/:componenteId')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  eliminarComponenteCombo(@Param('id') id: string, @Param('componenteId') componenteId: string, @Request() req: any) {
    return this.productosService.eliminarComponenteCombo(+id, +componenteId, req.user.empresaId);
  }

  @Post(':id/lotes')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  crearLote(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.productosService.crearLote(+id, body, req.user.empresaId);
  }

  @Get(':id/lotes')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  listarLotes(@Param('id') id: string, @Request() req: any) {
    return this.productosService.listarLotes(+id, req.user.empresaId);
  }

  @Patch(':id/lotes/:loteId')
  @Roles('ADMIN_EMPRESA', 'GERENTE')
  actualizarLote(@Param('id') id: string, @Param('loteId') loteId: string, @Body() body: any, @Request() req: any) {
    return this.productosService.actualizarLote(+id, +loteId, body, req.user.empresaId);
  }
}
