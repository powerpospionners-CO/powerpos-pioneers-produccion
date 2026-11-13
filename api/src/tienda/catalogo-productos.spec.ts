import { NotFoundException } from '@nestjs/common';
import { ProductosService } from '../productos/productos.service';
import { TiendaService } from './tienda.service';

describe('Catálogo compartido entre Productos y Mi tienda', () => {
  function preparar() {
    let producto = { id: 7, empresaId: 24, activo: true, nombre: 'Café', descripcion: 'Molido', precio: 12000, imagen: null as string | null, disponible: true, categoria: { nombre: 'Bebidas', activo: true } };
    const prisma: any = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ id: 24, activo: true, nombre: 'Mercado', logo: null, tiendaConfig: { publicada: true } }) },
      producto: {
        findFirst: jest.fn(({ where }) => Promise.resolve(where.id === producto.id && where.empresaId === producto.empresaId ? { ...producto } : null)),
        findMany: jest.fn(({ where }) => Promise.resolve(where.empresaId === producto.empresaId ? [{ ...producto }] : [])),
        update: jest.fn(({ data }) => { producto = { ...producto, ...data }; return Promise.resolve({ ...producto }); }),
      },
    };
    return { prisma, productos: new ProductosService(prisma, {} as any), tienda: new TiendaService(prisma, {} as any) };
  }
  it('publica la misma imagen y los detalles guardados con los endpoints de Productos', async () => {
    const { productos, tienda } = preparar();
    await productos.actualizar(7, { descripcion: 'Café de origen, tostión media', precio: 14500 }, 24);
    await productos.actualizarImagen(7, 24, 'https://example.com/uploads/productos/cafe.png');
    const catalogo = await tienda.catalogo('mercado');
    expect(catalogo.productos[0]).toMatchObject({ id: 7, precio: 14500, descripcion: 'Café de origen, tostión media', imagen: 'https://example.com/uploads/productos/cafe.png' });
    const { origen, origenId, ...camposCompartidos } = catalogo.productos[0];
    expect(await productos.obtener(7, 24)).toMatchObject(camposCompartidos);
    expect(origen).toBe(''); expect(origenId).toBeNull();
  });
  it('vuelve a leer el precio y la imagen al consultar una tienda ya abierta', async () => {
    const { productos, tienda } = preparar();
    expect((await tienda.catalogo('mercado')).productos[0].precio).toBe(12000);
    await productos.actualizar(7, { precio: 15000, imagen: null, disponible: false }, 24);
    expect((await tienda.catalogo('mercado')).productos[0]).toMatchObject({ precio: 15000, imagen: null, disponible: false });
  });
  it('impide cambiar datos o imagen de un producto de otra empresa', async () => {
    const { productos, prisma } = preparar();
    await expect(productos.actualizar(7, { precio: 1 }, 99)).rejects.toThrow(NotFoundException);
    await expect(productos.actualizarImagen(7, 99, 'https://example.com/ajena.png')).rejects.toThrow(NotFoundException);
    expect(prisma.producto.update).not.toHaveBeenCalled();
  });
});
