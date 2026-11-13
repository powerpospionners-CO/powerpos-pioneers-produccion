import { OrigenesService, agregarOrigen } from './origenes.service';
import type { OrigenProducto } from './origenes.service';
import type { PrismaService } from '../prisma/prisma.service';
describe('Orígenes propios de cada empresa', () => {
  function preparar() {
    const empresas = new Map<
      number,
      { tiendaConfig: { titulo?: string; origenes: OrigenProducto[] } }
    >([
      [24, { tiendaConfig: { titulo: 'Mi tienda', origenes: [] } }],
      [99, { tiendaConfig: { origenes: [] } }],
    ]);
    const tx = {
      $queryRaw: jest.fn(),
      empresa: {
        findUnique: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(empresas.get(where.id)),
        ),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: number };
            data: { tiendaConfig: { origenes: OrigenProducto[] } };
          }) => {
            empresas.set(where.id, data);
            return Promise.resolve(data);
          },
        ),
      },
      producto: {
        findFirst: jest.fn(
          ({ where }: { where: { empresaId: number; id: number } }) =>
            Promise.resolve(
              where.empresaId === 24 && where.id === 7 ? { id: 7 } : null,
            ),
        ),
      },
    };
    const db = {
      ...tx,
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    };
    return {
      servicio: new OrigenesService(db as unknown as PrismaService),
      tx,
      empresas,
    };
  }
  it('crea, asigna y renombra sin cambiar el resto de la tienda', async () => {
    const { servicio, empresas } = preparar();
    const [origen] = await servicio.guardar(24, 'Mexicano');
    await servicio.asignar(24, 7, origen.id);
    await servicio.guardar(24, 'De México', origen.id);
    expect(agregarOrigen({ id: 7 }, await servicio.listar(24))).toMatchObject({
      origen: 'De México',
      origenId: origen.id,
    });
    expect(empresas.get(24)?.tiendaConfig.titulo).toBe('Mi tienda');
    expect(await servicio.listar(99)).toEqual([]);
    await servicio.asignar(24, 7, null);
    expect(agregarOrigen({ id: 7 }, await servicio.listar(24)).origen).toBe('');
  });
  it('rechaza nombres duplicados, vacíos y orígenes ajenos', async () => {
    const { servicio } = preparar();
    const [origen] = await servicio.guardar(24, 'Asiático');
    await expect(servicio.guardar(24, ' asiatico ')).rejects.toThrow(
      'Ya existe',
    );
    expect(() => servicio.guardar(24, '')).toThrow();
    await expect(servicio.guardar(99, 'Otro', origen.id)).rejects.toThrow(
      'Origen no encontrado',
    );
    await expect(servicio.asignar(99, 7, origen.id)).rejects.toThrow(
      'Producto no encontrado',
    );
    await expect(servicio.asignar(24, 7, 'ajeno')).rejects.toThrow(
      'no pertenece',
    );
  });
});
