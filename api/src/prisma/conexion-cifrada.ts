import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function clave() {
  const valor = process.env.SEDE_DATABASE_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(valor))
    throw new Error('Falta la clave de cifrado de las bases por sede');
  return Buffer.from(valor, 'hex');
}
export function cifrarConexion(
  conexion: string,
  empresaId: number,
  sucursalId: number,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', clave(), iv);
  cipher.setAAD(Buffer.from(`${empresaId}:${sucursalId}`));
  const contenido = Buffer.concat([
    cipher.update(conexion, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('hex'),
    cipher.getAuthTag().toString('hex'),
    contenido.toString('hex'),
  ].join('.');
}
export function descifrarConexion(
  valor: string,
  empresaId: number,
  sucursalId: number,
) {
  const [version, iv, tag, contenido, ...extra] = valor.split('.');
  if (
    version !== 'v1' ||
    extra.length ||
    !/^[a-f0-9]{24}$/.test(iv || '') ||
    !/^[a-f0-9]{32}$/.test(tag || '') ||
    !/^(?:[a-f0-9]{2})+$/.test(contenido || '')
  )
    throw new Error('Conexión cifrada inválida');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    clave(),
    Buffer.from(iv, 'hex'),
  );
  decipher.setAAD(Buffer.from(`${empresaId}:${sucursalId}`));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(contenido, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
