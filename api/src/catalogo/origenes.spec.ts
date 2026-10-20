import { CatalogoService } from './catalogo.service';
import { normalizarOrigen } from './origenes';

describe('Orígenes del catálogo de Enchila Market', () => {
  function escenario() {
    const registros: any[] = [];
    const db: any = {
      empresa: { findUnique: jest.fn().mockResolvedValue({ id: 2, activo: true, catalogoHabilitado: true }) },
      auditoria: {
        findMany: jest.fn().mockImplementation(async () => registros),
        create: jest.fn().mockImplementation(async ({ data }) => { registros.push({ detalle: data.detalle }); return data; }),
      },
      catalogoProducto: {
        findFirst: jest.fn().mockResolvedValue({ id: 7, empresaId: 2, origen: 'MEXICANO', usos: ['TIENDA'] }),
        update: jest.fn().mockImplementation(async args => args.data),
      },
      $executeRaw: jest.fn(),
    };
    db.$transaction = jest.fn(fn => fn(db));
    return { db, service: new CatalogoService(db) };
  }

  it('incluye Colombiano y Asiático sin cambiar los productos existentes', async () => {
    const { db, service } = escenario();
    const lista = await service.listarOrigenes(2);
    expect(lista.map(o => o.codigo)).toEqual(['MEXICANO', 'PERUANO', 'COLOMBIANO', 'ASIATICO']);
    expect(db.catalogoProducto.update).not.toHaveBeenCalled();
    expect(db.auditoria.findMany.mock.calls[0][0].where).toEqual({ empresaId: 2, entidad: 'CatalogoOrigen', accion: 'CREAR' });
  });

  it('guarda un origen sin producto y evita duplicados por mayúsculas y tildes', async () => {
    const { db, service } = escenario();
    expect(await service.crearOrigen('  Europeo  ', 2, 99)).toEqual({ codigo: 'EUROPEO', nombre: 'Europeo' });
    await service.crearOrigen('EUROPEO', 2, 99);
    await service.crearOrigen('asiático', 2, 99);
    expect(db.auditoria.create).toHaveBeenCalledTimes(1);
    expect(db.auditoria.create.mock.calls[0][0].data).toMatchObject({ empresaId: 2, usuarioId: 99 });
    expect((await service.listarOrigenes(2)).some(o => o.codigo === 'EUROPEO')).toBe(true);
  });

  it('edita solo el origen y conserva los usos del producto', async () => {
    const { db, service } = escenario();
    await service.actualizar(7, { origen: 'COLOMBIANO' }, 2);
    expect(db.catalogoProducto.findFirst).toHaveBeenCalledWith({ where: { id: 7, empresaId: 2 } });
    expect(db.catalogoProducto.update.mock.calls[0][0].data).toEqual({ origen: 'COLOMBIANO', usos: ['TIENDA'] });
    await service.actualizar(7, { usos: ['MAYORISTA'] }, 2);
    expect(db.catalogoProducto.update.mock.calls[1][0].data).toEqual({ origen: 'MEXICANO', usos: ['MAYORISTA'] });
  });

  it('rechaza orígenes desconocidos y no permite crear opciones en otra empresa', async () => {
    const { db, service } = escenario();
    await expect(service.actualizar(7, { origen: 'INVENTADO' }, 2)).rejects.toThrow('créalo primero');
    await expect(service.crearOrigen('Europeo', 1, 99)).rejects.toThrow('Enchila');
    expect(db.catalogoProducto.update).not.toHaveBeenCalled();
    expect(db.auditoria.create).not.toHaveBeenCalled();
  });

  it('valida nombres antes de guardarlos', () => {
    for (const nombre of ['', 'A', '<script>', 'Origen\n123', 5, 'A'.repeat(51)]) expect(() => normalizarOrigen(nombre)).toThrow();
    expect(normalizarOrigen('  Asiático  ')).toEqual({ codigo: 'ASIATICO', nombre: 'Asiático' });
  });

  it('publica los nombres de los orígenes personalizados sin exponer la auditoría', async () => {
    const { db, service } = escenario();
    await service.crearOrigen('Europeo', 2, 99);
    db.empresa.findFirst = jest.fn().mockResolvedValue({ id: 2, activo: true, catalogoHabilitado: true, nombre: 'Enchila', tiendaConfig: {}, catalogoFotosPublicas: true });
    db.catalogoProducto.findMany = jest.fn().mockResolvedValue([{ id: 7, origen: 'EUROPEO' }]);
    const publico = await service.catalogoPublico('enchilamarketpereira');
    expect(publico.origenes).toContainEqual({ codigo: 'EUROPEO', nombre: 'Europeo' });
    expect(publico).not.toHaveProperty('usuarioId');
  });
});
