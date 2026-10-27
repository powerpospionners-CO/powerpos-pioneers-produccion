import { ClientesService } from './clientes.service';

describe('Búsqueda de clientes para crédito', () => {
  const findMany = jest.fn(async () => []);
  const servicio = new ClientesService({ cliente: { findMany } } as any);
  beforeEach(() => findMany.mockClear());
  it('sin texto muestra los clientes activos de la empresa autenticada', async () => {
    await servicio.listar(2, '   ');
    expect(findMany).toHaveBeenCalledWith({ where: { empresaId: 2, activo: true }, orderBy: { nombre: 'asc' } });
  });
  it('busca por nombre, documento o teléfono quitando espacios accidentales', async () => {
    await servicio.listar(2, '  María  ');
    expect(findMany).toHaveBeenCalledWith({ where: { empresaId: 2, activo: true, OR: [
      { nombre: { contains: 'María', mode: 'insensitive' } }, { telefono: { contains: 'María' } }, { documento: { contains: 'María' } },
    ] }, orderBy: { nombre: 'asc' } });
  });
  it('rechaza búsquedas inesperadas antes de consultar la base', async () => {
    await expect(servicio.listar(2, ['cliente'] as any)).rejects.toThrow('búsqueda');
    await expect(servicio.listar(2, 'x'.repeat(151))).rejects.toThrow('búsqueda');
    expect(findMany).not.toHaveBeenCalled();
  });
});
