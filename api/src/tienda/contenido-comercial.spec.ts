import { validarComercial, productosComerciales } from './contenido-comercial';
import { tiendaConfig } from './reglas';
import { TiendaService } from './tienda.service';
describe('Configuración comercial por empresa', () => {
  const base = () => tiendaConfig({});
  it('conserva fechas y reúne todos los productos para verificar pertenencia', () => {
    const c = validarComercial({
      ...base(),
      destacadosIds: [2],
      novedadesIds: [3],
      promociones: [
        {
          titulo: 'Oferta',
          detalle: 'Condiciones reales',
          desde: '2026-11-25',
          hasta: '2026-11-30',
          productoId: 4,
        },
      ],
      fichasProductos: [
        { productoId: 2, imagenes: ['https://ejemplo.com/foto.png'] },
      ],
    });
    expect(productosComerciales(c)).toEqual([2, 3, 4]);
  });
  it.each([
    {
      promociones: [
        {
          titulo: 'Oferta',
          detalle: 'Condiciones',
          desde: '2026-11-30',
          hasta: '2026-11-25',
          productoId: null,
        },
      ],
    },
    {
      promociones: [
        {
          titulo: 'Oferta',
          detalle: 'Condiciones',
          desde: '2026-02-30',
          hasta: '2026-03-03',
          productoId: null,
        },
      ],
    },
    { fichasProductos: [{ productoId: 1, imagenes: ['javascript:alert(1)'] }] },
    { testimonios: [{ nombre: 'Nombre', texto: 'Opinión', autorizado: 'sí' }] },
  ])('rechaza fechas, imágenes o permisos inválidos', (parche) =>
    expect(() => validarComercial({ ...base(), ...parche })).toThrow(),
  );
  it('rechaza productos de otra empresa antes de guardar', async () => {
    const db: any = {
      empresa: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ tiendaConfig: {}, fidelizacionConfig: {} }),
        update: jest.fn(),
      },
      producto: { count: jest.fn().mockResolvedValue(0) },
    };
    const s = new TiendaService(db, {} as any, {} as any);
    await expect(
      s.configurar(7, { tienda: { destacadosIds: [88] } }),
    ).rejects.toThrow('su empresa');
    expect(db.producto.count).toHaveBeenCalledWith({
      where: { empresaId: 7, id: { in: [88] } },
    });
    expect(db.empresa.update).not.toHaveBeenCalled();
  });
  it('el catálogo público no revela testimonios sin autorización', async () => {
    const db: any = {
      empresa: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          activo: true,
          logo: null,
          tiendaConfig: {
            testimonios: [
              { nombre: 'Público', texto: 'Opinión', autorizado: true },
              { nombre: 'Privado', texto: 'Borrador', autorizado: false },
            ],
          },
        }),
      },
      producto: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const s = new TiendaService(
      db,
      {} as any,
      { disponible: jest.fn().mockResolvedValue(false) } as any,
    );
    expect((await s.catalogo('empresa')).config.testimonios).toEqual([
      { nombre: 'Público', texto: 'Opinión', autorizado: true },
    ]);
  });
});
