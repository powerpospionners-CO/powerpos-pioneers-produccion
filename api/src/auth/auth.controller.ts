import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string; sucursalId?: number }) {
    return this.authService.login(body.email, body.password, body.sucursalId);
  }

  @Post('registrar-empresa')
  registrarEmpresa(@Body() body: any) {
    return this.authService.registrarEmpresa(body);
  }
}
