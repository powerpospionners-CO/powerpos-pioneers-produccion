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
});
