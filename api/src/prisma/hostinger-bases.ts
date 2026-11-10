import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cifrarConexion, descifrarConexion } from './conexion-cifrada';
import { identidadBase } from './sede-databases';
import { conexionNuevaMysql } from './sedes-provision.mysql';

function esAutomatica(valor: Prisma.JsonValue | null) {
  return (
    valor !== null &&
    typeof valor === 'object' &&
    !Array.isArray(valor) &&
    valor.proveedor === 'HOSTINGER'
  );
}

export function configuracionHostinger() {
  const cuenta = process.env.HOSTINGER_ACCOUNT || '';
  const token = process.env.HOSTINGER_API_TOKEN || '';
  const dominio = process.env.HOSTINGER_WEBSITE_DOMAIN || '';
  const control = new URL(
    process.env.DATABASE_URL || 'mysql://localhost/control',
  );
  if (
    !/^u\d+$/.test(cuenta) ||
    !token ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dominio) ||
    !control.pathname.startsWith('/' + cuenta + '_') ||
    !/^[a-fA-F0-9]{64}$/.test(process.env.SEDE_DATABASE_ENCRYPTION_KEY || '')
  ) {
    throw new ServiceUnavailableException(
      'Configura la creación automática de bases en el servidor: cuenta, dominio y token API de Hostinger.',
    );
  }
  return { cuenta, token, dominio };
}

// La conexión queda cifrada ANTES de llamar al proveedor. Un corte de red
// conserva el nombre y la contraseña y permite continuar sin crear otra base.
export async function asegurarBaseHostinger(
  control: PrismaClient,
  empresaId: number,
  sucursalId: number,
) {
  const clave = { empresaId_sucursalId: { empresaId, sucursalId } };
  let registro = await control.baseSede.findUnique({ where: clave });
  if (registro && !esAutomatica(registro.verificacion)) return;
  if (registro?.estado === 'ACTIVA' || registro?.estado === 'VERIFICADA')
    return;
  const config = configuracionHostinger();
  if (!registro) {
    registro = await control.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      const existente = await tx.baseSede.findUnique({ where: clave });
      if (existente) return existente;
      const sede = await tx.sucursal.findFirst({
        where: { id: sucursalId, empresaId },
      });
      const empresa = await tx.empresa.findUnique({ where: { id: empresaId } });
      if (!sede || !empresa)
        throw new ServiceUnavailableException(
          'La sede no pertenece a esta empresa',
        );
      const otraSede = await tx.baseSede.findFirst({
        where: { empresaId, slug: empresa.tiendaSlug },
      });
      const sufijo = 'pp' + randomBytes(6).toString('hex');
      const nombre = config.cuenta + '_' + sufijo;
      const conexion = conexionNuevaMysql({
        base: nombre,
        usuario: nombre,
        password: randomBytes(24).toString('base64url'),
      });
      return tx.baseSede.create({
        data: {
          empresaId,
          sucursalId,
          estado: 'PREPARANDO',
          slug: otraSede ? randomUUID() : empresa.tiendaSlug,
          agenteHash: empresa.impresionAgenteToken
            ? createHash('sha256')
                .update(empresa.impresionAgenteToken)
                .digest('hex')
            : null,
          conexionCifrada: cifrarConexion(conexion, empresaId, sucursalId),
          identidadBase: identidadBase(conexion),
          verificacion: { proveedor: 'HOSTINGER' },
        },
      });
    });
  }
  if (!esAutomatica(registro.verificacion)) return;
  await control.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${empresaId} FOR UPDATE`;
      registro = await tx.baseSede.findUnique({ where: clave });
      if (registro?.estado === 'ACTIVA' || registro?.estado === 'VERIFICADA')
        return;
      if (!registro || !esAutomatica(registro.verificacion))
        throw new ServiceUnavailableException(
          'Cambió la conexión de la sede; vuelve a consultar su estado',
        );
      const url = new URL(
        descifrarConexion(registro.conexionCifrada, empresaId, sucursalId),
      );
      const nombre = decodeURIComponent(url.pathname.slice(1));
      if (
        !nombre.startsWith(config.cuenta + '_pp') ||
        identidadBase(url.toString()) !== registro.identidadBase
      ) {
        throw new ServiceUnavailableException(
          'La conexión reservada no corresponde a la base de la sede',
        );
      }
      const endpoint = `https://developers.hostinger.com/api/hosting/v1/accounts/${config.cuenta}/databases`;
      const headers = {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      try {
        // Consulta exacta incluso cuando el proveedor aplica búsqueda parcial.
        const listado = await fetch(
          endpoint + '?search=' + encodeURIComponent(nombre) + '&per_page=100',
          { headers, signal: AbortSignal.timeout(20000), redirect: 'error' },
        );
        if (!listado.ok) throw new Error();
        const respuesta = (await listado.json()) as {
          data?: Array<{ name: string; user: string }>;
        };
        if (!Array.isArray(respuesta.data)) throw new Error();
        const existente = respuesta.data.find((base) => base.name === nombre);
        if (existente) {
          if (existente.user !== decodeURIComponent(url.username))
            throw new Error();
          return;
        }
        const creada = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
          body: JSON.stringify({
            name: nombre,
            user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            website_domain: config.dominio,
          }),
        });
        if (!creada.ok) throw new Error();
      } catch {
        // No imprimir respuestas del proveedor: pueden contener datos de conexión.
        throw new ServiceUnavailableException(
          'No se pudo confirmar la creación de la base en Hostinger. La empresa está guardada; usa Preparar sedes pendientes para reintentar sin duplicarla.',
        );
      }
    },
    { timeout: 65000, maxWait: 15000 },
  );
}
