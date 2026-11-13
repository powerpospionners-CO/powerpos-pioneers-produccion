import { TiendaService } from './tienda.service';
import type { PrismaService } from '../prisma/prisma.service';
describe('Mapa público de tiendas', () => {
  it('omite empresas inactivas y tiendas ocultas y no devuelve datos internos', async () => {
    const findMany = jest.fn().mockResolvedValue([{ tiendaSlug: 'visible', tiendaConfig: { publicada: true } }, { tiendaSlug: 'oculta', tiendaConfig: { publicada: false } }, { tiendaSlug: 'app', tiendaConfig: {} }]);
    const db = { control: { empresa: { findMany } }, aislamientoActivo: false };
    const servicio = new TiendaService(db as unknown as PrismaService, {} as never);
    expect(await servicio.mapaPublico()).toEqual([{ slug: 'visible' }]);
    expect(findMany).toHaveBeenCalledWith({ where: { activo: true }, select: { tiendaSlug: true, tiendaConfig: true } });
    await servicio.mapaPublico(); expect(findMany).toHaveBeenCalledTimes(1);
  });
  it('en bases aisladas consulta la publicación actual de cada sede', async () => {
    const db = { aislamientoActivo: true, control: { baseSede: { findMany: jest.fn().mockResolvedValue([{ slug: 'visible' }, { slug: 'oculta' }]) } }, sedePublica: jest.fn((slug: string) => Promise.resolve({ empresaId: 24, cliente: { empresa: { findUnique: jest.fn().mockResolvedValue({ activo: true, tiendaConfig: { publicada: slug === 'visible' } }) } } })) };
    const servicio = new TiendaService(db as unknown as PrismaService, {} as never);
    expect(await servicio.mapaPublico()).toEqual([{ slug: 'visible' }]);
  });
});
