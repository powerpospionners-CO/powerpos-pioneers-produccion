import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export const hash = (valor: string | Buffer) =>
  createHash('sha256').update(valor).digest('hex');
export function texto(valor: unknown, campo: string, max = 200) {
  if (
    typeof valor !== 'string' ||
    !valor.trim() ||
    valor.trim().length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(valor)
  )
    throw new BadRequestException(`Revisa ${campo}`);
  return valor.trim();
}
export function fecha(valor: unknown) {
  const s = texto(valor, 'fecha', 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new BadRequestException('Fecha inválida');
  return s;
}
export function centavos(valor: unknown) {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(String(valor)))
    throw new BadRequestException('Importe inválido: usa hasta dos decimales');
  return Math.round(Number(valor) * 100);
}
export function clavePersonal() {
  const clave = process.env.PERSONAL_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(clave))
    throw new ServiceUnavailableException(
      'Personal requiere configurar su clave privada de cifrado',
    );
  return Buffer.from(clave, 'hex');
}
export function cifrar(datos: unknown, identidad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clavePersonal(), iv);
  c.setAAD(Buffer.from(identidad));
  const contenido = Buffer.concat([
    c.update(JSON.stringify(datos), 'utf8'),
    c.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
    contenido: contenido.toString('base64'),
  };
}
export function descifrar(datos: any, identidad: string): any {
  try {
    const c = createDecipheriv(
      'aes-256-gcm',
      clavePersonal(),
      Buffer.from(datos.iv, 'base64'),
    );
    c.setAAD(Buffer.from(identidad));
    c.setAuthTag(Buffer.from(datos.tag, 'base64'));
    return JSON.parse(
      Buffer.concat([
        c.update(Buffer.from(datos.contenido, 'base64')),
        c.final(),
      ]).toString('utf8'),
    );
  } catch {
    throw new ServiceUnavailableException(
      'No se pudo verificar la integridad del expediente privado',
    );
  }
}
export const identidad = (r: any) =>
  `${r.empresaId}:${r.sucursalId}:${r.tipo}:${r.id}:${r.version}`;
export const hoy = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function validarPeriodo(d: any) {
  const desde = fecha(d.desde),
    hasta = fecha(d.hasta);
  if (desde > hasta || Date.parse(hasta) - Date.parse(desde) > 31 * 86400000)
    throw new BadRequestException('El periodo debe ser de hasta 32 días');
  if (
    !Array.isArray(d.conceptos) ||
    !d.conceptos.length ||
    d.conceptos.length > 60
  )
    throw new BadRequestException('Agrega los conceptos de la nómina');
  const conceptos = d.conceptos.map((c: any) => {
    if (!['DEVENGADO', 'DEDUCCION'].includes(c.tipo))
      throw new BadRequestException('Tipo de concepto inválido');
    const montoCentavos = centavos(c.monto);
    if (montoCentavos <= 0)
      throw new BadRequestException(
        'Cada concepto debe tener un importe positivo',
      );
    return {
      tipo: c.tipo,
      nombre: texto(c.nombre, 'concepto'),
      montoCentavos,
      ...(c.tipo === 'DEDUCCION'
        ? {
            fundamento: texto(c.fundamento, 'fundamento de la deducción', 1000),
            soporteId: texto(
              c.soporteId,
              'soporte de autorización o fundamento',
              36,
            ),
          }
        : {}),
    };
  });
  const totalCentavos = conceptos.reduce(
    (n: number, c: any) =>
      n + (c.tipo === 'DEVENGADO' ? 1 : -1) * c.montoCentavos,
    0,
  );
  if (totalCentavos <= 0)
    throw new BadRequestException('El neto debe ser positivo');
  if (d.revisado !== true)
    throw new BadRequestException(
      'Confirma la revisión de los conceptos y deducciones por el responsable de nómina',
    );
  return {
    desde,
    hasta,
    conceptos,
    totalCentavos,
    fechaProgramada: fecha(d.fechaProgramada),
    revisado: true,
  };
}
