import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

function objeto(valor: unknown, campos: string[]): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor))
    throw new BadRequestException('Se requiere un objeto JSON');
  const datos = valor as Record<string, unknown>;
  if (Object.keys(datos).some((campo) => !campos.includes(campo)))
    throw new BadRequestException('La solicitud contiene campos no permitidos');
  return datos;
}
function texto(
  datos: Record<string, unknown>,
  campo: string,
  min: number,
  max: number,
  opcional = false,
) {
  const valor = datos[campo];
  if (opcional && valor === undefined) return undefined;
  if (
    typeof valor !== 'string' ||
    valor.length < min ||
    valor.length > max ||
    (campo !== 'password' && !valor.trim())
  )
    throw new BadRequestException(`Campo ${campo} inválido`);
  if (campo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor))
    throw new BadRequestException('Email inválido');
  return campo === 'password' ? valor : valor.trim();
}

@Injectable()
export class LoginInputPipe implements PipeTransform {
  transform(valor: unknown) {
    const datos = objeto(valor, ['email', 'password', 'sucursalId']);
    const email = texto(datos, 'email', 3, 250);
    // bcrypt solo procesa 72 bytes: rechazar entradas ambiguas, sin truncarlas.
    const password = texto(datos, 'password', 1, 72);
    if (Buffer.byteLength(password, 'utf8') > 72)
      throw new BadRequestException('Contraseña demasiado larga');
    if (
      datos.sucursalId !== undefined &&
      (!Number.isSafeInteger(datos.sucursalId) || Number(datos.sucursalId) < 1)
    )
      throw new BadRequestException('Sede inválida');
    return {
      email,
      password,
      sucursalId: datos.sucursalId as number | undefined,
    };
  }
}

@Injectable()
export class RegistroInputPipe implements PipeTransform {
  transform(valor: unknown) {
    const datos = objeto(valor, ['empresa', 'admin']);
    const empresa = objeto(datos.empresa, [
      'nombre',
      'nit',
      'email',
      'telefono',
    ]);
    const admin = objeto(datos.admin, ['nombre', 'email', 'password']);
    const password = texto(admin, 'password', 10, 72);
    if (Buffer.byteLength(password, 'utf8') > 72)
      throw new BadRequestException('Contraseña demasiado larga');
    return {
      empresa: {
        nombre: texto(empresa, 'nombre', 2, 160),
        nit: texto(empresa, 'nit', 3, 40),
        email: texto(empresa, 'email', 3, 250),
        telefono: texto(empresa, 'telefono', 3, 40, true),
      },
      admin: {
        nombre: texto(admin, 'nombre', 2, 160),
        email: texto(admin, 'email', 3, 250),
        password,
      },
    };
  }
}
