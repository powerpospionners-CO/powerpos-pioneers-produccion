import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AdministracionGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const usuario = context.switchToHttp().getRequest().user;
    if (
      process.env.ADMINISTRACION_HABILITADA !== 'true' ||
      !usuario?.empresaId ||
      usuario.permisos?.administracion !== true
    ) {
      throw new ForbiddenException(
        'Los controles administrativos no están habilitados para esta empresa',
      );
    }
    return true;
  }
}
