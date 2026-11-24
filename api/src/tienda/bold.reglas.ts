import {
  BadRequestException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export type BoldConfig = {
  habilitado: boolean;
  merchantId: string;
  identidad: string;
  secreto: string;
  webhookRegistrado: boolean;
};
function key() {
  const root =
    process.env.BOLD_ENCRYPTION_KEY || process.env.PERSONAL_ENCRYPTION_KEY;
  if (!/^[a-f\d]{64}$/i.test(root || ''))
    throw new ServiceUnavailableException(
      'Falta configurar el cifrado privado de pagos en el servidor',
    );
  // Clave distinta de expedientes, aunque se use la misma raíz privada de producción.
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(root!, 'hex'),
      Buffer.from('PowerPOS'),
      Buffer.from('bold/configuracion/v1'),
      32,
    ),
  );
}
export function cifrarBold(datos: BoldConfig, scope: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(scope));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(datos), 'utf8'),
    cipher.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    body: body.toString('hex'),
  };
}
export function abrirBold(datos: any, scope: string): BoldConfig {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(datos.iv, 'hex'),
  );
  decipher.setAAD(Buffer.from(scope));
  decipher.setAuthTag(Buffer.from(datos.tag, 'hex'));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(datos.body, 'hex')),
      decipher.final(),
    ]).toString('utf8'),
  );
}
export function validarFirmaBold(raw: Buffer, firma: unknown, secreto: string) {
  if (
    !Buffer.isBuffer(raw) ||
    typeof firma !== 'string' ||
    !/^[a-f\d]{64}$/i.test(firma) ||
    !secreto
  )
    throw new UnauthorizedException('Firma de Bold inválida');
  const esperado = createHmac('sha256', secreto)
    .update(raw.toString('base64'))
    .digest();
  if (!timingSafeEqual(esperado, Buffer.from(firma, 'hex')))
    throw new UnauthorizedException('Firma de Bold inválida');
}
export function montoBold(total: unknown): number {
  const n = Number(total);
  if (!Number.isSafeInteger(n) || n < 1000 || n > 99999999)
    throw new BadRequestException(
      'Bold requiere un total en pesos enteros, desde $1.000 COP',
    );
  return n;
}
export function integridadBold(
  referencia: string,
  total: number,
  secreto: string,
) {
  return createHash('sha256')
    .update(`${referencia}${montoBold(total)}COP${secreto}`)
    .digest('hex');
}
export function metodoBold(
  metodo: string,
): 'TARJETA' | 'TRANSFERENCIA' | 'NEQUI' {
  if (['CARD', 'CARD_WEB', 'CREDIT_CARD', 'DEBIT_CARD'].includes(metodo))
    return 'TARJETA';
  if (metodo === 'NEQUI') return 'NEQUI';
  if (['PSE', 'QR', 'BANCOLOMBIA', 'BOTON_BANCOLOMBIA'].includes(metodo))
    return 'TRANSFERENCIA';
  throw new BadRequestException(
    'Medio de pago de Bold no reconocido; requiere revisión',
  );
}
