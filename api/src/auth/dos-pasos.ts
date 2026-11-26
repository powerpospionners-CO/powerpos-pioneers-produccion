import { ServiceUnavailableException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { jwtSecret } from './jwt-secret';

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buffer: Buffer) {
  let bits = 0,
    valor = 0,
    salida = '';
  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function desdeBase32(texto: string) {
  const limpio = texto.replace(/=+$/, '').toUpperCase();
  let bits = 0,
    valor = 0;
  const bytes: number[] = [];
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('Secreto inválido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// RFC 6238 (TOTP) con HMAC-SHA1, 6 dígitos y pasos de 30 segundos: compatible con
// Google Authenticator, Microsoft Authenticator y similares.
export function codigoTotp(secreto: string, paso: number) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', desdeBase32(secreto)).update(contador).digest();
  const o = h[h.length - 1] & 15;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1000000;
  return String(n).padStart(6, '0');
}

export const pasoActual = (ahora = Date.now()) => Math.floor(ahora / 30000);

// Acepta un paso de desfase y nunca un paso ya usado (protege contra reutilizar el código).
export function verificarTotp(
  secreto: string,
  codigo: unknown,
  ultimoPaso: number,
  ahora = Date.now(),
) {
  if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) return null;
  const actual = pasoActual(ahora);
  for (const paso of [actual - 1, actual, actual + 1]) {
    if (paso <= ultimoPaso) continue;
    const esperado = Buffer.from(codigoTotp(secreto, paso));
    if (timingSafeEqual(esperado, Buffer.from(codigo))) return paso;
  }
  return null;
}

export const nuevoSecreto = () => base32(randomBytes(20));

export function uriTotp(secreto: string, cuenta: string, emisor = 'PowerPOS') {
  const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30`;
}

export function codigosRecuperacion(cantidad = 10) {
  return Array.from({ length: cantidad }, () => {
    const t = base32(randomBytes(6)).slice(0, 10);
    return `${t.slice(0, 5)}-${t.slice(5)}`;
  });
}

export const hashRecuperacion = (codigo: string) =>
  createHash('sha256')
    .update(codigo.replace(/[\s-]/g, '').toUpperCase())
    .digest('hex');

function derivar(proposito: string) {
  const raiz =
    process.env.PERSONAL_ENCRYPTION_KEY || process.env.BOLD_ENCRYPTION_KEY;
  if (!/^[a-f\d]{64}$/i.test(raiz || ''))
    throw new ServiceUnavailableException(
      'Falta configurar el cifrado privado en el servidor',
    );
  return Buffer.from(
    hkdfSync('sha256', Buffer.from(raiz!, 'hex'), Buffer.from('PowerPOS'), Buffer.from(`auth/${proposito}/v1`), 32),
  );
}

export function cifrarSecreto(secreto: string, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', derivar('totp'), iv);
  c.setAAD(Buffer.from(aad));
  const cuerpo = Buffer.concat([c.update(secreto, 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), cuerpo: cuerpo.toString('base64') };
}

export function abrirSecreto(d: { iv: string; tag: string; cuerpo: string }, aad: string) {
  const x = createDecipheriv('aes-256-gcm', derivar('totp'), Buffer.from(d.iv, 'base64'));
  x.setAAD(Buffer.from(aad));
  x.setAuthTag(Buffer.from(d.tag, 'base64'));
  return Buffer.concat([x.update(Buffer.from(d.cuerpo, 'base64')), x.final()]).toString('utf8');
}

// Desafío del segundo paso: otra clave y otro formato, nunca válido como sesión del panel.
const claveDesafio = () =>
  Buffer.from(hkdfSync('sha256', Buffer.from(jwtSecret()), Buffer.from('PowerPOS'), Buffer.from('auth/desafio-2fa/v1'), 32));

export type Desafio = { sub: number; rol: string; empresaId: number | null; sucursalId: number | null; exp: number };

export function firmarDesafio(d: Omit<Desafio, 'exp'>, ahora = Date.now()) {
  const cuerpo = Buffer.from(JSON.stringify({ ...d, exp: ahora + 300000 })).toString('base64url');
  return `2fa.${cuerpo}.${createHmac('sha256', claveDesafio()).update(cuerpo).digest('base64url')}`;
}

export function leerDesafio(token: unknown, ahora = Date.now()): Desafio | null {
  if (typeof token !== 'string' || token.length > 800) return null;
  const [prefijo, cuerpo, firma] = token.split('.');
  if (prefijo !== '2fa' || !cuerpo || !firma) return null;
  const esperada = createHmac('sha256', claveDesafio()).update(cuerpo).digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    return Number.isSafeInteger(d.sub) && typeof d.rol === 'string' && d.exp > ahora ? d : null;
  } catch {
    return null;
  }
}

// Huella aproximada del dispositivo: navegador + red /24. Solo para avisar de accesos nuevos.
export function huellaDispositivo(ip: string, agente: string) {
  const red = /^\d+\.\d+\.\d+\.\d+$/.test(ip)
    ? ip.split('.').slice(0, 3).join('.')
    : ip.split(':').slice(0, 4).join(':');
  return createHash('sha256').update(`${red}|${agente.slice(0, 200)}`).digest('hex').slice(0, 32);
}

export function describirAgente(agente: string) {
  const a = agente || '';
  const navegador = /Edg\//.test(a) ? 'Edge' : /OPR\//.test(a) ? 'Opera' : /Chrome\//.test(a) ? 'Chrome' : /Firefox\//.test(a) ? 'Firefox' : /Safari\//.test(a) ? 'Safari' : /Electron\//.test(a) ? 'PowerPOS escritorio' : 'Navegador';
  const sistema = /Windows/.test(a) ? 'Windows' : /Android/.test(a) ? 'Android' : /iPhone|iPad/.test(a) ? 'iOS' : /Mac OS X/.test(a) ? 'macOS' : /Linux/.test(a) ? 'Linux' : 'Sistema desconocido';
  return `${/Electron\//.test(a) ? 'PowerPOS escritorio' : navegador} en ${sistema}`;
}
