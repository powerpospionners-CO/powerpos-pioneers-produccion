import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Request,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { contextoSede } from '../prisma/sede-context';
import { PersonalService } from './personal.service';
import { DocumentosEmpresaService } from './documentos-empresa.service';
import { ContratoEditorService } from './contrato-editor.service';

function descargar(res: Response, bytes: Buffer, nombre: string, mime: string) {
  res.set({
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Content-Type': mime,
    'Content-Disposition': `attachment; filename="${nombre}"`,
  });
  res.send(bytes);
}
@Controller('personal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN_EMPRESA')
export class PersonalController {
  constructor(
    private service: PersonalService,
    private editor: ContratoEditorService,
    private documentos: DocumentosEmpresaService,
  ) {}
  @Get('documentos-empresa')
  @Header('Cache-Control', 'no-store, private')
  biblioteca(@Request() r: any) {
    return this.documentos.inicio(r.user);
  }
  @Post('documentos-empresa') crearDocumentoEmpresa(
    @Request() r: any,
    @Body() d: any,
  ) {
    return this.documentos.crear(r.user, d);
  }
  @Post('documentos-empresa/:id/adoptar') adoptarPolitica(
    @Request() r: any,
    @Param('id') id: string,
    @Body() d: any,
  ) {
    return this.documentos.adoptar(r.user, id, d);
  }
  @Post('documentos-empresa/:id/retirar-enlace') retirarEnlacePolitica(
    @Request() r: any,
    @Param('id') id: string,
  ) {
    return this.documentos.retirarEnlace(r.user, id);
  }
  @Post('documentos-empresa/:id/entregas') entregarPolitica(
    @Request() r: any,
    @Param('id') id: string,
    @Body() d: any,
  ) {
    return this.documentos.entregar(r.user, id, d);
  }
  @Get('documentos-empresa/:id/pdf') async documentoEmpresa(
    @Request() r: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { bytes } = await this.documentos.documento(r.user, id);
    descargar(res, bytes, 'documento-empresa.pdf', 'application/pdf');
  }
  @Get('editor') @Header('Cache-Control', 'no-store, private') editorInicio(
    @Request() r: any,
  ) {
    return this.editor.inicio(r.user);
  }
  @Post('editor/plantillas-modalidad') plantillaModalidad(
    @Request() r: any,
    @Body() d: any,
  ) {
    return this.editor.plantillaModalidad(r.user, d);
  }
  @Post('editor/preparar') prepararContrato(@Request() r: any, @Body() d: any) {
    return this.editor.prepararContrato(r.user, d);
  }
  @Post('editor/modelos') modelo(@Request() r: any, @Body() d: any) {
    return this.editor.modelo(r.user, d);
  }
  @Post('editor/borradores') borrador(@Request() r: any, @Body() d: any) {
    return this.editor.guardar(r.user, d);
  }
  @Patch('editor/borradores/:id') borradorEditar(
    @Request() r: any,
    @Param('id') id: string,
    @Body() d: any,
  ) {
    return this.editor.guardar(r.user, d, id);
  }
  @Post('editor/borradores/:id/revisar') revisarBorrador(
    @Request() r: any,
    @Param('id') id: string,
    @Body() d: any,
  ) {
    return this.editor.revisar(r.user, id, d);
  }
  @Post('editor/borradores/:id/emitir') emitirBorrador(
    @Request() r: any,
    @Param('id') id: string,
    @Body() d: any,
  ) {
    return this.editor.emitir(r.user, id, d);
  }
  @Get('editor/borradores/:id/historial')
  @Header('Cache-Control', 'no-store, private')
  versiones(@Request() r: any, @Param('id') id: string) {
    return this.editor.historial(r.user, id);
  }
  @Get('editor/borradores/:id/pdf') async borradorPdf(
    @Request() r: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    descargar(
      res,
      await this.editor.vista(r.user, id),
      'borrador-contrato.pdf',
      'application/pdf',
    );
  }
  @Get('editor/borradores/:id/versiones/:version/pdf') async versionPdf(
    @Request() r: any,
    @Param('id') id: string,
    @Param('version') version: string,
    @Res() res: Response,
  ) {
    descargar(
      res,
      await this.editor.vista(r.user, id, Number(version)),
      'version-anterior-contrato.pdf',
      'application/pdf',
    );
  }
  @Get('editor/borradores/:id/revisado') async revisadoPdf(
    @Request() r: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    descargar(
      res,
      await this.editor.originalRevisado(r.user, id),
      'contrato-original-revisado.pdf',
      'application/pdf',
    );
  }
  @Get() @Header('Cache-Control', 'no-store, private') inicio(
    @Request() r: any,
  ) {
    return this.service.inicio(r.user);
  }
  @Post('configuracion') configurar(@Request() r: any, @Body() d: any) {
    return this.service.configurar(r.user, d);
  }
  @Post('empleados') empleado(@Request() r: any, @Body() d: any) {
    return this.service.empleado(r.user, d);
  }
  @Patch('empleados/:id') editar(
    @Request() r: any,
    @Param('id') id: string,
    @Body() d: any,
  ) {
    return this.service.empleado(r.user, d, id);
  }
  @Post('archivos')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  archivo(@Request() r: any, @UploadedFile() file: any) {
    return this.service.archivo(r.user, file).then((f) => ({
      id: f.id,
      nombre: f.datos.nombre,
      sha256: f.datos.sha256,
    }));
  }
  @Post('periodos') periodo(@Request() r: any, @Body() d: any) {
    return this.service.periodo(r.user, d);
  }
  @Post('pagos') pago(@Request() r: any, @Body() d: any) {
    return this.service.pago(r.user, d);
  }
  @Post('plantillas') plantilla(@Request() r: any, @Body() d: any) {
    return this.service.plantilla(r.user, d);
  }
  @Post('contratos') contrato(@Request() r: any, @Body() d: any) {
    return this.service.contrato(r.user, d);
  }
  @Post(':id/firma-empleador') firmar(
    @Request() r: any,
    @Param('id') id: string,
    @Body() d: any,
  ) {
    return this.service.firmarEmpleador(r.user, id, d);
  }
  @Post(':id/firmar-enviar') firmarYEnviar(
    @Request() r: any,
    @Param('id') id: string,
    @Body() d: any,
  ) {
    return this.service.firmarYEnviar(r.user, id, d);
  }
  @Post(':id/invitar') invitar(@Request() r: any, @Param('id') id: string) {
    return this.service.invitar(r.user, id);
  }
  @Post(':id/copia') copia(@Request() r: any, @Param('id') id: string) {
    return this.service.entregarCopia(r.user, id);
  }
  @Get(':id/historial') @Header('Cache-Control', 'no-store, private') historial(
    @Request() r: any,
    @Param('id') id: string,
  ) {
    return this.service.historial(r.user, id);
  }
  @Get(':id/documento') async documento(
    @Request() r: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    descargar(
      res,
      await this.service.original(r.user, id),
      'documento.pdf',
      'application/pdf',
    );
  }
  @Get(':id/paquete') async paquete(
    @Request() r: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    descargar(
      res,
      await this.service.paquete(r.user, id),
      'documento-laboral.zip',
      'application/zip',
    );
  }
}

// El enlace opaco valida la sede antes del interceptor global. Nunca se utiliza una sesión administrativa.
@Injectable()
export class PersonalFirmaGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private service: PersonalService,
  ) {}
  async canActivate(c: ExecutionContext) {
    const r = c.switchToHttp().getRequest(),
      empresaId = Number(r.params.empresa),
      sucursalId = Number(r.params.sede);
    if (
      !Number.isSafeInteger(empresaId) ||
      empresaId < 1 ||
      !Number.isSafeInteger(sucursalId) ||
      sucursalId < 1 ||
      typeof r.body?.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(r.body.token)
    )
      throw new ForbiddenException('Enlace no válido');
    r.res.set({
      'Cache-Control': 'no-store, private',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    await this.prisma.estadoAislamiento();
    const scope = this.prisma.aislamientoActivo
      ? await this.prisma.contexto(empresaId, sucursalId)
      : 'CONTROL';
    r.sedeContext = scope;
    r.personalActor = { id: 0, empresaId, sucursalId };
    await contextoSede.run(scope, () =>
      this.service.acceso(r.personalActor, r.body.token),
    );
    return true;
  }
}
@Controller('personal-firma/:empresa/:sede')
@UseGuards(PersonalFirmaGuard)
export class PersonalFirmaController {
  constructor(
    private service: PersonalService,
    private documentos: DocumentosEmpresaService,
  ) {}
  @Post('politica') async politicaCompleta(
    @Request() r: any,
    @Body() d: any,
    @Res() res: Response,
  ) {
    const i = await this.service.sesion(r.personalActor, d.token, d.sesion);
    const id = i.datos.politica?.politicaId;
    if (!id)
      throw new ForbiddenException(
        'Esta invitación no tiene una política del sistema vinculada',
      );
    const { bytes } = await this.documentos.documento(r.personalActor, id);
    descargar(res, bytes, 'politica-tratamiento-datos.pdf', 'application/pdf');
  }
  @Post('codigo') codigo(@Request() r: any, @Body() d: any) {
    return this.service.solicitarCodigo(r.personalActor, d.token);
  }
  @Post('verificar') verificar(@Request() r: any, @Body() d: any) {
    return this.service.verificarCodigo(
      r.personalActor,
      d.token,
      String(d.codigo || ''),
    );
  }
  @Post('vista') vista(@Request() r: any, @Body() d: any) {
    return this.service.vista(r.personalActor, d.token, d.sesion);
  }
  @Post('resolver') resolver(@Request() r: any, @Body() d: any) {
    return this.service.resolver(
      r.personalActor,
      d.token,
      d.sesion,
      d,
      String(r.ip || ''),
    );
  }
  @Post('documento') async documento(
    @Request() r: any,
    @Body() d: any,
    @Res() res: Response,
  ) {
    const i = await this.service.sesion(r.personalActor, d.token, d.sesion);
    descargar(
      res,
      await this.service.original(r.personalActor, i.datos.documentoId),
      'documento.pdf',
      'application/pdf',
    );
  }
  @Post('paquete') async paquete(
    @Request() r: any,
    @Body() d: any,
    @Res() res: Response,
  ) {
    const i = await this.service.sesion(r.personalActor, d.token, d.sesion);
    descargar(
      res,
      await this.service.paquete(r.personalActor, i.datos.documentoId),
      'documento-laboral.zip',
      'application/zip',
    );
  }
}

// Publica exclusivamente versiones de políticas que el administrador decidió hacer públicas.
@Injectable()
export class PoliticaPublicaGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}
  async canActivate(c: ExecutionContext) {
    const r = c.switchToHttp().getRequest();
    const empresaId = Number(r.params.empresa),
      sucursalId = Number(r.params.sede);
    if (
      !Number.isSafeInteger(empresaId) ||
      empresaId < 1 ||
      !Number.isSafeInteger(sucursalId) ||
      sucursalId < 1 ||
      !/^[a-f0-9-]{36}$/.test(r.params.id)
    )
      throw new ForbiddenException('Enlace inválido');
    await this.prisma.estadoAislamiento();
    r.sedeContext = this.prisma.aislamientoActivo
      ? await this.prisma.contexto(empresaId, sucursalId)
      : 'CONTROL';
    r.personalActor = { id: 0, empresaId, sucursalId };
    return true;
  }
}
@Controller('personal-politicas/:empresa/:sede/:id')
@UseGuards(PoliticaPublicaGuard)
export class PoliticaPublicaController {
  constructor(private documentos: DocumentosEmpresaService) {}
  @Get() async politica(
    @Request() r: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { bytes } = await this.documentos.documento(
      r.personalActor,
      id,
      true,
    );
    descargar(res, bytes, 'politica-tratamiento-datos.pdf', 'application/pdf');
  }
}
