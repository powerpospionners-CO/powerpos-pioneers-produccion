import { resumenHorarios, validarHorarios } from './horarios';
import { tiendaConfig } from './reglas';
import { TiendaService } from './tienda.service';
describe('Horarios y ciudades de cada tienda', () => {
  const semana = Array.from({ length: 7 }, (_, dia) => ({
    dia,
    abierto: dia < 6,
    apertura: '10:30',
    cierre: '19:30',
  }));
  it('publica los días y horas seleccionados y agrupa horarios iguales', () => {
    const h = validarHorarios(semana)!;
    expect(resumenHorarios(h)).toBe(
      'Lunes a sábado: 10:30 a. m. – 7:30 p. m.; Domingo: cerrado',
    );
    expect(h[6]).toEqual({ dia: 6, abierto: false, apertura: '', cierre: '' });
  });
  it.each([
    { value: [] },
    { value: [...semana.slice(0, 6), semana[0]] },
    { value: semana.map((h) => ({ ...h, apertura: '25:00' })) },
    { value: semana.map((h) => ({ ...h, cierre: h.apertura })) },
  ])('rechaza días u horas inválidos', ({ value }) =>
    expect(() => validarHorarios(value)).toThrow(),
  );
  it('permite cierres nocturnos y los identifica como día siguiente', () => {
    expect(
      resumenHorarios(
        validarHorarios(
          semana.map((h) => ({ ...h, apertura: '18:00', cierre: '01:00' })),
        )!,
      ),
    ).toContain('día siguiente');
  });
  it('conserva el horario anterior si todavía no se configuraron selectores', () => {
    expect(validarHorarios(null)).toBeNull();
    expect(tiendaConfig({ horario: 'Horario anterior' }).horario).toBe(
      'Horario anterior',
    );
  });
  it('separa ciudades existentes de zonas y conserva las tarifas', () => {
    const t = tiendaConfig({
      zonas: [
        { nombre: 'PEREIRA', costo: 10000 },
        { nombre: 'DOSQUEBRADAS', costo: 7000 },
      ],
    });
    expect(t.ciudadesEntrega).toEqual(['Pereira', 'Dosquebradas']);
    expect(t.zonas).toEqual([
      {
        id: 'zona-1',
        ciudad: 'Pereira',
        nombre: 'Todas las zonas',
        costo: 10000,
      },
      {
        id: 'zona-2',
        ciudad: 'Dosquebradas',
        nombre: 'Todas las zonas',
        costo: 7000,
      },
    ]);
    expect(
      tiendaConfig({ zonas: [{ nombre: 'Centro', costo: 3000 }] })
        .ciudadesEntrega,
    ).toEqual([]);
  });
  function servicio() {
    const db: any = {
      empresa: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          activo: true,
          tiendaConfig: {
            publicada: true,
            pedidosHabilitados: true,
            sucursalId: 3,
            ciudadesEntrega: ['Pereira', 'Dosquebradas'],
            zonas: [
              { id: 'per', ciudad: 'Pereira', nombre: 'Centro', costo: 10000 },
              {
                id: 'dos',
                ciudad: 'Dosquebradas',
                nombre: 'Centro',
                costo: 7000,
              },
            ],
          },
        }),
      },
      pedidoWeb: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }) => ({
          id: 'pedido',
          estado: 'RECIBIDO',
          ...data,
        })),
      },
      sucursal: { findFirst: jest.fn().mockResolvedValue({ id: 3 }) },
      producto: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 7, nombre: 'Producto', precio: 1000, stockActual: 5 },
          ]),
      },
    };
    return { db, service: new TiendaService(db, {} as any, {} as any) };
  }
  const body = {
    clave: 'identificador-unico-123456',
    nombre: 'Cliente',
    telefono: '3001234567',
    direccion: 'Prueba',
    ciudad: 'Dosquebradas',
    zona: 'dos',
    metodoPago: 'EFECTIVO',
    totalEsperado: 8000,
    items: [{ productoId: 7, cantidad: 1 }],
  };
  it('cobra la tarifa de la ciudad correcta cuando las zonas tienen el mismo nombre', async () => {
    const { db, service } = servicio();
    await expect(service.solicitar('tienda', body)).resolves.toMatchObject({
      total: 8000,
      costoDomicilio: 7000,
    });
    expect(db.pedidoWeb.create.mock.calls[0][0].data.zona).toBe(
      'Dosquebradas · Centro',
    );
  });
  it('impide usar la tarifa de una zona de otra ciudad', async () => {
    const { db, service } = servicio();
    await expect(
      service.solicitar('tienda', { ...body, ciudad: 'Pereira' }),
    ).rejects.toThrow('no pertenece');
    expect(db.pedidoWeb.create).not.toHaveBeenCalled();
  });
});
