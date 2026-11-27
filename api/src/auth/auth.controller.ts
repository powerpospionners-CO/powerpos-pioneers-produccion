import { Controller, Post, Body, UseGuards, Req, Get, Delete, Param, Request } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SeguridadCuentaService } from './seguridad-cuenta.service';
import { SoporteService } from './soporte.service';
import { LoginInputPipe, RegistroInputPipe } from './auth-input.pipe';
import { AuthRateGuard } from './auth-rate.guard';
import { AuthService } from './auth.service';

@Controller('auth')
@UseGuards(AuthRateGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  private meta(req: any) {
    return { ip: String(req.ip || req.socket?.remoteAddress || ''), agente: String(req.headers?.['user-agent'] || '') };
  }

  @Post('login')
  login(@Body(LoginInputPipe) body: { email: string; password: string; sucursalId?: number }, @Req() req: any) {
    return this.authService.login(body.email, body.password, body.sucursalId, this.meta(req));
  }

  @Post('login/2fa')
  loginDosPasos(@Body() body: any, @Req() req: any) {
    return this.authService.loginDosPasos(body?.desafio, body?.codigo, this.meta(req));
  }


  @Post('registrar-empresa')
  registrarEmpresa(@Body(RegistroInputPipe) body: ReturnType<RegistroInputPipe['transform']>) {
    return this.authService.registrarEmpresa(body);
  }
}

// Separado del controlador de acceso: consultar la seguridad no consume el límite de intentos de login.
@Controller('auth/seguridad')
@UseGuards(JwtAuthGuard)
export class SeguridadCuentaController {
  constructor(private seguridad: SeguridadCuentaService) {}
  @Get()
  resumen(@Request() req: any) { return this.seguridad.resumen(req.user); }

  @Post('correo-personal')
  correoPersonal(@Request() req: any, @Body() body: any) { return this.seguridad.guardarCorreoPersonal(req.user, body?.correo, body?.password, body?.codigo); }

  @Post('2fa/iniciar')
  iniciar(@Request() req: any) { return this.seguridad.iniciar(req.user); }

  @Post('2fa/activar')
  activar(@Request() req: any, @Body() body: any) { return this.seguridad.activar(req.user, body?.codigo); }

  @Post('2fa/desactivar')
  desactivar(@Request() req: any, @Body() body: any) { return this.seguridad.desactivar(req.user, body?.password, body?.codigo); }

  @Delete('sesiones/:id')
  revocar(@Request() req: any, @Param('id') id: string) { return this.seguridad.revocar(req.user, id); }

  @Post('sesiones/cerrar-otras')
  cerrarOtras(@Request() req: any) { return this.seguridad.cerrarOtras(req.user); }

  @Post('politica')
  politica(@Request() req: any, @Body() body: any) { return this.seguridad.cambiarPolitica(req.user, body?.exigir, body?.password, body?.codigo); }

  @Get('equipo')
  equipo(@Request() req: any) { return this.seguridad.equipo(req.user); }

  @Post('equipo/:id/restablecer-2fa')
  restablecer(@Request() req: any, @Param('id') id: string, @Body() body: any) { return this.seguridad.restablecer(req.user, id, body?.password, body?.codigo); }
}

// Modo soporte del superadministrador (solo lectura). Fuera del límite de intentos de inicio de sesión.
@Controller('auth/soporte')
@UseGuards(JwtAuthGuard)
export class SoporteController {
  constructor(private soporte: SoporteService) {}
  @Post()
  iniciar(@Request() req: any, @Body() body: any) { return this.soporte.iniciar(req.user, body?.empresaId, body?.sucursalId, body?.motivo); }
}
