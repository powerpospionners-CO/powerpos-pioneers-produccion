import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LoginInputPipe, RegistroInputPipe } from './auth-input.pipe';
import { AuthRateGuard } from './auth-rate.guard';
import { AuthService } from './auth.service';

@Controller('auth')
@UseGuards(AuthRateGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body(LoginInputPipe) body: { email: string; password: string; sucursalId?: number }) {
    return this.authService.login(body.email, body.password, body.sucursalId);
  }

  @Post('registrar-empresa')
  registrarEmpresa(@Body(RegistroInputPipe) body: ReturnType<RegistroInputPipe['transform']>) {
    return this.authService.registrarEmpresa(body);
  }
}
