import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { contextoSede, ContextoSede } from './sede-context';
import { descifrarConexion } from './conexion-cifrada';
import { identidadBase } from './sede-databases';
import { createHash } from 'node:crypto';

const MODELOS = new Set(
  Prisma.dmmf.datamodel.models.map(
    (m) => m.name[0].toLowerCase() + m.name.slice(1),
  ),
);
const OPERACIONES = new Set([
  '$transaction',
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
]);
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  readonly control: PrismaClient;
  aislamientoActivo = false;
  private readonly clientesSede = new Map<
    number,
    { firma: string; cliente: PrismaClient; verificacion: Promise<void> }
  >();
  constructor() {
    super();
    this.control = this;
    return new Proxy(this, {
      get: (target, key) => {
        if (typeof key === 'string' && OPERACIONES.has(key)) {
          // Nest inspects method properties at startup. Resolve the branch only
          // when an operation is invoked, never while metadata is being scanned.
          return (...args: unknown[]) => {
            const selected = target.clienteActual();
            return Reflect.get(selected, key).apply(selected, args);
          };
        }
        if (typeof key === 'string' && MODELOS.has(key)) {
          if (!target.aislamientoActivo)
            return Reflect.get(target.control, key);
          return new Proxy(Reflect.get(target.control, key), {
            get: (delegate, operation) => {
              const value = Reflect.get(delegate, operation);
              if (typeof value !== 'function') return value;
              return (...args: unknown[]) => {
                const selected = Reflect.get(target.clienteActual(), key);
                return Reflect.get(selected, operation).apply(selected, args);
              };
            },
          });
        }
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  private clienteActual(): PrismaClient {
    if (!this.aislamientoActivo) return this.control;
    const contexto = contextoSede.getStore();
    if (contexto === 'CONTROL') return this.control;
    if (!contexto)
      throw new ServiceUnavailableException(
        'La operación requiere una sede autenticada',
      );
    return contexto.cliente;
  }
  async estadoAislamiento() {
    const state = await this.control.controlAislamiento.findUnique({
      where: { id: 1 },
    });
    this.aislamientoActivo = state?.activo === true;
    return state;
  }
  async contexto(
    empresaId: number,
    sucursalId: number,
    permitirInactiva = false,
  ): Promise<ContextoSede> {
    if (
      !Number.isSafeInteger(empresaId) ||
      !Number.isSafeInteger(sucursalId) ||
      empresaId < 1 ||
      sucursalId < 1
    )
      throw new ServiceUnavailableException('Sede no válida');
    const sede = await this.control.baseSede.findUnique({
      where: { empresaId_sucursalId: { empresaId, sucursalId } },
    });
    if (!sede || sede.estado !== 'ACTIVA' || !sede.verificadoEn)
      throw new ServiceUnavailableException(
        'La base de esta sede no está habilitada',
      );
    const asignada = await this.control.sucursal.findFirst({
      where: {
        id: sucursalId,
        empresaId,
        ...(permitirInactiva ? {} : { activo: true }),
      },
      select: {
        id: true,
        nombre: true,
        direccion: true,
        telefono: true,
        activo: true,
      },
    });
    if (!asignada)
      throw new ServiceUnavailableException('La sede está inactiva');
    let entrada = this.clientesSede.get(sucursalId);
    if (!entrada || entrada.firma !== sede.conexionCifrada) {
      let url: URL;
      try {
        url = new URL(
          descifrarConexion(sede.conexionCifrada, empresaId, sucursalId),
        );
        if (
          identidadBase(url.toString()) !== sede.identidadBase ||
          identidadBase(url.toString()) ===
            identidadBase(process.env.DATABASE_URL || '')
        )
          throw new Error('Destino incorrecto');
      } catch {
        throw new ServiceUnavailableException(
          'No se pudo validar la conexión de esta sede',
        );
      }
      url.searchParams.set('connection_limit', '3');
      url.searchParams.set('pool_timeout', '5');
      url.searchParams.set('connect_timeout', '5');
      const cliente = new PrismaClient({
        datasources: { db: { url: url.toString() } },
      });
      const verificacion = (async () => {
        const sello = await cliente.selloBaseSede.findUnique({
          where: { id: 1 },
        });
        if (
          !sello ||
          sello.empresaId !== empresaId ||
          sello.sucursalId !== sucursalId
        )
          throw new Error('Sello de sede incorrecto');
        if (
          (await cliente.empresa.count()) !== 1 ||
          (await cliente.sucursal.count()) !== 1
        )
          throw new Error('La base contiene otras empresas o sedes');
      })();
      void verificacion.catch(() => undefined);
      if (entrada) void entrada.cliente.$disconnect().catch(() => undefined);
      entrada = { firma: sede.conexionCifrada, cliente, verificacion };
      this.clientesSede.set(sucursalId, entrada);
    }
    try {
      await entrada.verificacion;
    } catch {
      this.clientesSede.delete(sucursalId);
      void entrada.cliente.$disconnect().catch(() => undefined);
      throw new ServiceUnavailableException(
        'No se pudo verificar la base de esta sede',
      );
    }
    await this.sincronizarPolitica(entrada.cliente, empresaId, sede.slug);
    const local = await entrada.cliente.sucursal.findUnique({
      where: { id: sucursalId },
      select: {
        id: true,
        nombre: true,
        direccion: true,
        telefono: true,
        activo: true,
      },
    });
    if (JSON.stringify(local) !== JSON.stringify(asignada))
      await entrada.cliente.sucursal.update({
        where: { id: sucursalId },
        data: asignada,
      });
    return { empresaId, sucursalId, cliente: entrada.cliente };
  }
  private async sincronizarPolitica(
    cliente: PrismaClient,
    empresaId: number,
    slug: string | null,
  ) {
    const select = {
      nombre: true,
      nit: true,
      email: true,
      telefono: true,
      direccion: true,
      activo: true,
      plan: true,
      permisos: true,
      tipoNegocio: true,
      modoPreparacion: true,
      facturacionElectronicaHabilitada: true,
      consumoEmpleadosHabilitado: true,
      catalogoHabilitado: true,
      recaudoEfectivoHabilitado: true,
      distribuidoresHabilitado: true,
      suscripcionVenceEn: true,
      pagoExonerado: true,
      motivoExoneracion: true,
      soporteIncluidoHasta: true,
      soportePagadoHasta: true,
    } as const;
    const [politica, actual] = await Promise.all([
      this.control.empresa.findUnique({ where: { id: empresaId }, select }),
      cliente.empresa.findUnique({
        where: { id: empresaId },
        select: { ...select, tiendaSlug: true },
      }),
    ]);
    if (!politica || !actual)
      throw new ServiceUnavailableException(
        'La empresa no está configurada en esta sede',
      );
    const { tiendaSlug, ...campos } = actual;
    if (
      JSON.stringify(politica) !== JSON.stringify(campos) ||
      (slug && tiendaSlug !== slug)
    )
      await cliente.empresa.update({
        where: { id: empresaId },
        data: {
          ...politica,
          permisos: politica.permisos as Prisma.InputJsonValue,
          ...(slug ? { tiendaSlug: slug } : {}),
        },
      });
  }
  async sedePublica(slug: string) {
    const sede = await this.control.baseSede.findUnique({ where: { slug } });
    if (!sede || sede.estado !== 'ACTIVA')
      throw new ServiceUnavailableException('Sede no disponible');
    return this.contexto(sede.empresaId, sede.sucursalId);
  }
  async sedeAgente(token: string) {
    const agenteHash = createHash('sha256').update(token).digest('hex');
    const sede = await this.control.baseSede.findUnique({
      where: { agenteHash },
    });
    if (!sede || sede.estado !== 'ACTIVA')
      throw new ServiceUnavailableException('Agente no disponible');
    return this.contexto(sede.empresaId, sede.sucursalId);
  }
  async reservarSlug(slug: string) {
    if (!this.aislamientoActivo) return;
    const scope = contextoSede.getStore();
    if (!scope || scope === 'CONTROL')
      throw new ServiceUnavailableException('Selecciona una sede');
    await this.control.baseSede.update({
      where: {
        empresaId_sucursalId: {
          empresaId: scope.empresaId,
          sucursalId: scope.sucursalId,
        },
      },
      data: { slug },
    });
  }
  async registrarAgente(token: string) {
    if (!this.aislamientoActivo) return;
    const scope = contextoSede.getStore();
    if (!scope || scope === 'CONTROL')
      throw new ServiceUnavailableException('Selecciona una sede');
    await this.control.baseSede.update({
      where: {
        empresaId_sucursalId: {
          empresaId: scope.empresaId,
          sucursalId: scope.sucursalId,
        },
      },
      data: { agenteHash: createHash('sha256').update(token).digest('hex') },
    });
  }
  async conEscritura<T>(origen: string, trabajo: () => Promise<T>): Promise<T> {
    const lease = await this.control.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73200, 0)`;
      const estado = await tx.controlAislamiento.findUnique({
        where: { id: 1 },
      });
      if (estado?.escriturasSuspendidas)
        throw new ServiceUnavailableException(
          'Estamos verificando las bases de datos. Espera unos minutos antes de registrar operaciones.',
        );
      return tx.escrituraEnCurso.create({
        data: { origen: origen.slice(0, 100) },
      });
    });
    try {
      return await trabajo();
    } finally {
      await this.control.escrituraEnCurso.delete({ where: { id: lease.id } });
    }
  }
  async enCadaSede<T>(trabajo: () => Promise<T>) {
    const state = await this.estadoAislamiento();
    if (state?.escriturasSuspendidas) return [];
    if (!this.aislamientoActivo)
      return [await this.conEscritura('PROCESO_AUTOMATICO', trabajo)];
    const sedes = await this.control.baseSede.findMany({
      where: { estado: 'ACTIVA' },
    });
    const resultados: T[] = [];
    for (const sede of sedes) {
      const activa = await this.control.sucursal.findFirst({
        where: {
          id: sede.sucursalId,
          empresaId: sede.empresaId,
          activo: true,
          empresa: { activo: true },
        },
        select: { id: true },
      });
      if (!activa) continue;
      try {
        const scope = await this.contexto(sede.empresaId, sede.sucursalId);
        resultados.push(
          await this.conEscritura('PROCESO_AUTOMATICO', () =>
            contextoSede.run(scope, trabajo),
          ),
        );
      } catch {
        console.error(
          `No se pudo ejecutar el proceso automático de la sede ${sede.sucursalId}`,
        );
      }
    }
    return resultados;
  }
  async onModuleInit() {
    await this.control.$connect();
    await this.estadoAislamiento();
  }
  async onModuleDestroy() {
    await Promise.allSettled(
      [...this.clientesSede.values()].map((e) => e.cliente.$disconnect()),
    );
    await this.control.$disconnect();
  }
}
