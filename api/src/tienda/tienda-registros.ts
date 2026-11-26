import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { motorBase } from '../prisma/mysql-adapter';

// Claves derivadas por propósito: un secreto filtrado de un uso no abre los demás.
function derivar(proposito: string) {
  const raiz =
    process.env.BOLD_ENCRYPTION_KEY || process.env.PERSONAL_ENCRYPTION_KEY;
  if (!/^[a-f\d]{64}$/i.test(raiz || ''))
    throw new ServiceUnavailableException(
      'Falta configurar el cifrado privado de la tienda en el servidor',
    );
  return Buffer.from(
    hkdfSync(
      'sha256',
      Buffer.from(raiz!, 'hex'),
      Buffer.from('PowerPOS'),
      Buffer.from(`tienda/${proposito}/v1`),
      32,
    ),
  );
}

export function cifrarTienda(datos: unknown, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', derivar('datos'), iv);
  c.setAAD(Buffer.from(aad));
  const cuerpo = Buffer.concat([
    c.update(JSON.stringify(datos), 'utf8'),
    c.final(),
  ]);
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
    cuerpo: cuerpo.toString('base64'),
  };
}

export function abrirTienda<T = any>(datos: any, aad: string): T {
  const d = createDecipheriv(
    'aes-256-gcm',
    derivar('datos'),
    Buffer.from(datos.iv, 'base64'),
  );
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(datos.tag, 'base64'));
  return JSON.parse(
    Buffer.concat([
      d.update(Buffer.from(datos.cuerpo, 'base64')),
      d.final(),
    ]).toString('utf8'),
  );
}

// Índice ciego: permite encontrar un correo o teléfono sin guardarlo en claro.
export function indiceCiego(empresaId: number, tipo: string, valor: string) {
  return createHmac('sha256', derivar('indice'))
    .update(`${empresaId}:${tipo}:${valor}`)
    .digest('hex');
}

const b64 = (b: Buffer) => b.toString('base64url');

// Firma del QR de cada mesa: sin ella no se pueden enviar pedidos a mesas inventadas.
export function firmaMesa(empresaId: number, mesa: number) {
  return createHmac('sha256', derivar('mesas')).update(`${empresaId}:${mesa}`).digest('base64url').slice(0, 16);
}
export function mesaValida(empresaId: number, mesa: number, token: unknown) {
  if (typeof token !== 'string' || token.length !== 16) return false;
  const a = Buffer.from(firmaMesa(empresaId, mesa)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Fichas propias de clientes: otra clave y otro formato, nunca aceptadas como sesión del personal.
export function firmarCliente(datos: {
  e: number;
  s: string;
  c: string;
  v: number;
  exp: number;
}) {
  const cuerpo = b64(Buffer.from(JSON.stringify(datos)));
  const firma = b64(
    createHmac('sha256', derivar('sesion-cliente')).update(cuerpo).digest(),
  );
  return `cli.${cuerpo}.${firma}`;
}

export function leerCliente(token: unknown, ahora = Date.now()) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [prefijo, cuerpo, firma] = token.split('.');
  if (prefijo !== 'cli' || !cuerpo || !firma) return null;
  const esperada = createHmac('sha256', derivar('sesion-cliente'))
    .update(cuerpo)
    .digest();
  const recibida = Buffer.from(firma, 'base64url');
  if (
    recibida.length !== esperada.length ||
    !timingSafeEqual(recibida, esperada)
  )
    return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (
      !Number.isSafeInteger(d.e) ||
      typeof d.s !== 'string' ||
      typeof d.c !== 'string' ||
      !Number.isSafeInteger(d.v) ||
      !Number.isFinite(d.exp) ||
      d.exp < ahora
    )
      return null;
    return d as { e: number; s: string; c: string; v: number; exp: number };
  } catch {
    return null;
  }
}

export type Registro = {
  id: string;
  empresaId: number;
  tipo: string;
  clave: string;
  referenciaId: string | null;
  estado: string;
  datos: any;
  version: number;
  creadoEn: Date;
  actualizadoEn: Date;
};

@Injectable()
export class TiendaRegistros {
  constructor(private readonly prisma: PrismaService) {}

  // DDL aditivo y estático, solo desde la configuración autenticada; nunca por una petición pública.
  async preparar() {
    const mysql = motorBase() === 'mysql';
    await this.prisma.$executeRawUnsafe(
      mysql
        ? `CREATE TABLE IF NOT EXISTS tienda_registros (id VARCHAR(36) NOT NULL PRIMARY KEY, empresaId INT NOT NULL, tipo VARCHAR(24) NOT NULL, clave VARCHAR(128) NOT NULL, referenciaId VARCHAR(64) NULL, estado VARCHAR(24) NOT NULL, datos JSON NOT NULL, version INT NOT NULL DEFAULT 1, creadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE KEY tienda_clave (empresaId,tipo,clave), KEY tienda_referencia (empresaId,tipo,referenciaId), KEY tienda_listado (empresaId,tipo,creadoEn)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        : `CREATE TABLE IF NOT EXISTS tienda_registros (id VARCHAR(36) PRIMARY KEY, "empresaId" INTEGER NOT NULL, tipo VARCHAR(24) NOT NULL, clave VARCHAR(128) NOT NULL, "referenciaId" VARCHAR(64), estado VARCHAR(24) NOT NULL, datos JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE ("empresaId",tipo,clave))`,
    );
    // Mismos índices que declara el modelo de Prisma; en MySQL ya van dentro de CREATE TABLE.
    if (!mysql) {
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS tienda_registros_referencia ON tienda_registros ("empresaId", tipo, "referenciaId")`,
      );
      await this.prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS tienda_registros_listado ON tienda_registros ("empresaId", tipo, "creadoEn")`,
      );
    }
  }

  db(tx?: any): any {
    return tx || this.prisma;
  }

  // Una sede que aún no activó la función responde como no disponible, sin exponer el error.
  async seguro<T>(fn: () => Promise<T>, vacio?: T): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e?.code === 'P2021') {
        if (vacio !== undefined) return vacio;
        throw new ServiceUnavailableException(
          'Esta función todavía no está activa en la tienda',
        );
      }
      throw e;
    }
  }

  aad(r: { empresaId: number; tipo: string; id: string }) {
    return `${r.empresaId}:${r.tipo}:${r.id}`;
  }

  abrir<T = any>(r: Registro): T {
    return abrirTienda<T>(r.datos, this.aad(r));
  }

  // Sin tabla todavía equivale a "no existe". Dentro de una transacción PostgreSQL un
  // error la invalida, así que los llamadores solo consultan cuando la función está en uso.
  buscar(empresaId: number, tipo: string, clave: string, tx?: any) {
    return this.seguro<Registro | null>(
      () =>
        this.db(tx).tiendaRegistro.findUnique({
          where: { empresaId_tipo_clave: { empresaId, tipo, clave } },
        }),
      null,
    );
  }

  obtener(empresaId: number, tipo: string, id: string, tx?: any) {
    return this.seguro<Registro | null>(
      () =>
        this.db(tx).tiendaRegistro.findFirst({ where: { id, empresaId, tipo } }),
      null,
    );
  }

  listar(
    empresaId: number,
    tipo: string,
    filtro: Record<string, unknown> = {},
    take = 500,
    tx?: any,
  ) {
    return this.seguro<Registro[]>(
      () =>
        this.db(tx).tiendaRegistro.findMany({
          where: { empresaId, tipo, ...filtro },
          orderBy: { creadoEn: 'desc' },
          take,
        }),
      [],
    );
  }

  async crear(
    empresaId: number,
    tipo: string,
    clave: string,
    datos: unknown,
    opciones: { estado?: string; referenciaId?: string | null; cifrar?: boolean } = {},
    tx?: any,
  ) {
    const id = randomUUID();
    const aad = this.aad({ empresaId, tipo, id });
    return this.seguro<Registro>(() =>
      this.db(tx).tiendaRegistro.create({
        data: {
          id,
          empresaId,
          tipo,
          clave,
          referenciaId: opciones.referenciaId ?? null,
          estado: opciones.estado || 'ACTIVO',
          datos: opciones.cifrar === false ? (datos as any) : cifrarTienda(datos, aad),
        },
      }),
    );
  }

  // Concurrencia optimista: si otro proceso cambió el registro, se rechaza en vez de pisarlo.
  async actualizar(
    r: Registro,
    cambios: { datos?: unknown; estado?: string; cifrar?: boolean },
    tx?: any,
  ) {
    const data: any = { version: r.version + 1 };
    if (cambios.estado) data.estado = cambios.estado;
    if (cambios.datos !== undefined)
      data.datos =
        cambios.cifrar === false
          ? cambios.datos
          : cifrarTienda(cambios.datos, this.aad(r));
    const n = await this.seguro<{ count: number }>(() =>
      this.db(tx).tiendaRegistro.updateMany({
        where: { id: r.id, empresaId: r.empresaId, version: r.version },
        data,
      }),
    );
    if (n.count !== 1)
      throw new ConflictException(
        'La información cambió mientras la editabas. Vuelve a intentarlo.',
      );
    return { ...r, ...data } as Registro;
  }

  eliminar(r: Registro, tx?: any) {
    return this.seguro(() =>
      this.db(tx).tiendaRegistro.deleteMany({
        where: { id: r.id, empresaId: r.empresaId },
      }),
    );
  }
}
