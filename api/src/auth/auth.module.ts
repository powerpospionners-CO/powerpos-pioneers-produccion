import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController, SeguridadCuentaController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { jwtSecret } from './jwt-secret';
import { AuthRateGuard } from './auth-rate.guard';
import { SeguridadCuentaService } from './seguridad-cuenta.service';

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
  providers: [AuthService, JwtStrategy, AuthRateGuard, SeguridadCuentaService],
  controllers: [AuthController, SeguridadCuentaController],
  exports: [AuthService, SeguridadCuentaService],
})
export class AuthModule {}
