import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController, SeguridadCuentaController, SoporteController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { jwtSecret } from './jwt-secret';
import { AuthRateGuard } from './auth-rate.guard';
import { SeguridadCuentaService } from './seguridad-cuenta.service';
import { SoporteService } from './soporte.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: jwtSecret(),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, AuthRateGuard, SeguridadCuentaService, SoporteService],
  controllers: [AuthController, SeguridadCuentaController, SoporteController],
  exports: [AuthService, SeguridadCuentaService, SoporteService],
})
export class AuthModule {}
