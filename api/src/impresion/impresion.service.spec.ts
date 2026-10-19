import { createServer } from 'node:net';
import { ImpresionService } from './impresion.service';

describe('ImpresionService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should print a customer receipt via ESC/POS when enabled', async () => {
    const server = createServer((socket) => {
      socket.on('data', () => {
        socket.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('No se pudo obtener el puerto del servidor de prueba');
    }

    process.env.ESC_POS_ENABLED = 'true';
    process.env.ESC_POS_HOST = '127.0.0.1';
    process.env.ESC_POS_PORT = String(address.port);

    const service = new ImpresionService();
    const resultado = await service.imprimirRecibo(
      {
        numero: '1001',
        detalles: [
          {
            cantidad: 2,
            producto: { nombre: 'Hamburguesa' },
            exclusiones: ['sin cebolla'],
            observacion: 'sin salsa',
          },
        ],
        observacion: 'Mesa 5',
        total: 24000,
      },
      7,
    );

    expect(resultado).toEqual({ impreso: true, modo: 'tcp' });

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('prints the full company address across receipt lines', async () => {
    const direccion = 'Carrera 15 # 93-60, Local 201, Centro Comercial Plaza Central, Pereira, Risaralda';
    const prisma = {
      empresa: {
        findUnique: jest.fn().mockResolvedValue({
          nombre: 'Tienda',
          tipoNegocio: 'TIENDA',
          direccion,
        }),
      },
    };
    const service = new ImpresionService(prisma as any);
    const contenido = await (service as any).formatearRecibo(
      { numero: '1002', detalles: [], total: 0 },
      7,
    );
    const ticket = contenido.toString('ascii');
    const direccionImpresora = ticket.match(/DIR: ([\s\S]*?)\n={10}/)?.[1];

    expect(direccionImpresora).toBeDefined();
    expect(direccionImpresora!.replace(/\s+/g, ' ').trim()).toBe(direccion);
    expect(direccionImpresora!.split('\n').every((linea) => linea.length <= 32)).toBe(true);
  });

  it('identifica la estación del Trailer y conserva las instrucciones de cocina en ESC/POS', async () => {
    const service = new ImpresionService();
    const datos = { numero: '42', ladoNombre: 'PERROS Y FRITURAS', detalles: [{ cantidad: 2, producto: { nombre: 'Perro' }, exclusiones: ['cebolla'], adicionales: [{ nombre: 'Queso', cantidad: 2 }], observacion: '[Para llevar] Sin sal' }] };
    const contenido = (await (service as any).formatearComanda(datos, 1)).toString('ascii');
    for (const texto of ['PERROS Y FRITURAS', '2x Perro', 'SIN: cebolla', 'Queso x2', '[Para llevar] Sin sal']) expect(contenido).toContain(texto);
    const otraEmpresa = (await (service as any).formatearComanda(datos, 2)).toString('ascii');
    expect(otraEmpresa).not.toContain('PERROS Y FRITURAS');
  });

  it('envía Plancha y Vaporera en un solo trabajo con dos cortes de papel', async () => {
    process.env.ESC_POS_ENABLED = 'true'; process.env.IMPRESION_MODO = 'agente';
    const eventos = { enviarYEsperar: jest.fn().mockResolvedValue({ ok: true }) };
    const service = new ImpresionService(undefined, eventos as any);
    const comandas = [{ numero: '42', ladoNombre: 'PLANCHA', detalles: [{ cantidad: 1, producto: { nombre: 'AREPA BURGER SENCILLA' } }] }, { numero: '42', ladoNombre: 'VAPORERA', detalles: [{ cantidad: 1, producto: { nombre: 'PERRO SENCILLO' } }] }];
    const resultado = await service.imprimirComandas(comandas, 1);
    expect(resultado).toEqual({ impreso: true, modo: 'agente', estaciones: ['PLANCHA', 'VAPORERA'] });
    expect(eventos.enviarYEsperar).toHaveBeenCalledTimes(1);
    const bytes = eventos.enviarYEsperar.mock.calls[0][2] as Buffer;
    for (const texto of ['PLANCHA', 'VAPORERA', 'AREPA BURGER SENCILLA', 'PERRO SENCILLO']) expect(bytes.toString('ascii')).toContain(texto);
    const corte = Buffer.from([0x1d, 0x56, 0x41, 0x03]);
    const primero = bytes.indexOf(corte), segundo = bytes.indexOf(corte, primero + corte.length);
    expect(primero).toBeGreaterThan(0); expect(segundo).toBeGreaterThan(primero); expect(bytes.indexOf(corte, segundo + corte.length)).toBe(-1);
  });

  it('no envía lotes vacíos, estaciones repetidas o de otra empresa', async () => {
    const eventos = { enviarYEsperar: jest.fn() }; const service = new ImpresionService(undefined, eventos as any);
    const comanda = { ladoNombre: 'PLANCHA', detalles: [{ producto: { nombre: 'Arepa' } }] };
    await expect(service.imprimirComandas([], 1)).rejects.toThrow();
    await expect(service.imprimirComandas([comanda, comanda], 1)).rejects.toThrow();
    await expect(service.imprimirComandas([comanda], 2)).rejects.toThrow();
    expect(eventos.enviarYEsperar).not.toHaveBeenCalled();
  });
});
