import { BaseSede, PrismaClient } from '@prisma/client';
import {
  asegurarBaseHostinger,
  configuracionHostinger,
} from './hostinger-bases';
import { descifrarConexion } from './conexion-cifrada';

describe('Creación automática Hostinger', () => {
  const original = { ...process.env };
  const fetchOriginal = global.fetch;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  let registro: BaseSede | null;
  const findUnique = jest.fn(() => Promise.resolve(registro));
  const findFirst = jest.fn(() => Promise.resolve<BaseSede | null>(null));
  const create = jest.fn(
    ({
      data,
    }: {
      data: Omit<
        BaseSede,
        'id' | 'creadoEn' | 'actualizadoEn' | 'verificadoEn'
      >;
    }) => {
      registro = {
        id: 9,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        verificadoEn: null,
        ...data,
      };
      return Promise.resolve(registro);
    },
  );
  const control = {
    baseSede: { findUnique, findFirst, create },
    sucursal: { findFirst: jest.fn(() => Promise.resolve({ id: 4 })) },
    empresa: {
      findUnique: jest.fn(() =>
        Promise.resolve({ id: 3, tiendaSlug: 'cajica' }),
      ),
    },
    $queryRaw: jest.fn(),
    $transaction: (fn: (tx: PrismaClient) => Promise<unknown>) =>
      fn(control as unknown as PrismaClient),
  };
  const preparar = () =>
    asegurarBaseHostinger(control as unknown as PrismaClient, 3, 4);
  const listado = (data: unknown = []) => Response.json({ data });
  beforeEach(() => {
    Object.assign(process.env, {
      DATABASE_URL: 'mysql://control:secreto@127.0.0.1:3306/u123_control',
      SEDE_DATABASE_ENCRYPTION_KEY: 'a'.repeat(64),
      HOSTINGER_ACCOUNT: 'u123',
      HOSTINGER_API_TOKEN: 'token-privado',
      HOSTINGER_WEBSITE_DOMAIN: 'api.example.com',
    });
    registro = null;
    jest.clearAllMocks();
    fetchMock.mockReset();
    findFirst.mockResolvedValue(null);
    global.fetch = fetchMock;
  });
  afterEach(() => {
    process.env = { ...original };
    global.fetch = fetchOriginal;
  });
  it('exige configurar el proveedor antes de crear empresas', () => {
    delete process.env.HOSTINGER_API_TOKEN;
    expect(() => configuracionHostinger()).toThrow('Configura');
  });
  it('reserva credenciales cifradas antes de crear una base y usuario exclusivos', async () => {
    fetchMock.mockImplementation((_url, opciones) => {
      expect(registro?.conexionCifrada).toMatch(/^v1\./);
      return Promise.resolve(
        opciones?.method === 'POST' ? Response.json({}) : listado(),
      );
    });
    await preparar();
    const llamada = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    const cuerpo = llamada?.[1]?.body;
    if (typeof cuerpo !== 'string')
      throw new Error('Falta la solicitud de creación');
    const datos = JSON.parse(cuerpo) as {
      name: string;
      user: string;
      password: string;
      website_domain: string;
    };
    expect(datos.name).toMatch(/^u123_pp[a-f0-9]{12}$/);
    expect(datos.user).toBe(datos.name);
    expect(datos.website_domain).toBe('api.example.com');
    expect(registro.conexionCifrada).not.toContain(datos.password);
    const url = new URL(descifrarConexion(registro.conexionCifrada, 3, 4));
    expect(decodeURIComponent(url.password)).toBe(datos.password);
    expect(url.hostname).toBe('127.0.0.1');
  });
  it('tras una respuesta perdida reutiliza la misma base sin repetir su creación', async () => {
    fetchMock
      .mockResolvedValueOnce(listado())
      .mockRejectedValueOnce(new Error('corte'));
    await expect(preparar()).rejects.toThrow('sin duplicarla');
    const anterior = registro.conexionCifrada;
    const url = new URL(descifrarConexion(anterior, 3, 4));
    fetchMock
      .mockReset()
      .mockResolvedValue(
        listado([{ name: url.pathname.slice(1), user: url.username }]),
      );
    await preparar();
    expect(registro.conexionCifrada).toBe(anterior);
    expect(create).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('no toca bases existentes conectadas manualmente ni activas', async () => {
    fetchMock
      .mockResolvedValueOnce(listado())
      .mockResolvedValueOnce(Response.json({}));
    await preparar();
    registro.estado = 'ACTIVA';
    fetchMock.mockClear();
    await preparar();
    registro.estado = 'PREPARANDO';
    registro.verificacion = { motor: 'mysql' };
    await preparar();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('una sede adicional recibe otro slug, sin colisionar con la tienda principal', async () => {
    findFirst.mockResolvedValue({ slug: 'cajica' } as BaseSede);
    fetchMock
      .mockResolvedValueOnce(listado())
      .mockResolvedValueOnce(Response.json({}));
    await preparar();
    expect(registro.slug).not.toBe('cajica');
    expect(registro.slug).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('no revela errores del proveedor ni continúa con listados inválidos', async () => {
    fetchMock.mockResolvedValue(Response.json({ secreto: 'privado' }));
    await expect(preparar()).rejects.toThrow('No se pudo confirmar');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
