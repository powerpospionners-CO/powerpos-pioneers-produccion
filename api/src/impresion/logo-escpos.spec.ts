import { codificarLogoEscPos } from './logo-escpos';
import { ImpresionService } from './impresion.service';

describe('Imagen del logo en ESC/POS', () => {
  it('codifica columnas de 24 puntos, completa la última banda y avanza el papel entre bandas', () => {
    const pixeles = Buffer.alloc(2 * 25, 255);
    for (const [x, y] of [[0, 0], [0, 7], [1, 8], [0, 23], [1, 24]]) pixeles[y * 2 + x] = 0;
    const bytes = codificarLogoEscPos(pixeles, 2, 25);
    expect(bytes).toEqual(Buffer.from([
      27, 97, 1, 27, 51, 24,
      27, 42, 33, 2, 0, 0x81, 0, 1, 0, 0x80, 0, 10,
      27, 42, 33, 2, 0, 0, 0, 0, 0x80, 0, 0, 10,
      27, 50, 27, 97, 0,
    ]));
  });

  it('conserva la orientación y cada píxel de una imagen asimétrica de ancho no múltiplo de ocho', () => {
    const ancho = 19, alto = 49;
    const pixeles = Buffer.alloc(ancho * alto, 255);
    for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) if (x === y % ancho || x === 0 || y === 48) pixeles[y * ancho + x] = 0;
    const bytes = codificarLogoEscPos(pixeles, ancho, alto);
    let cursor = 6;
    for (let y = 0; y < alto; y += 24) {
      expect(bytes.subarray(cursor, cursor + 5)).toEqual(Buffer.from([27, 42, 33, ancho, 0])); cursor += 5;
      for (let x = 0; x < ancho; x++) for (let dy = 0; dy < 24; dy++) {
        const negro = !!(bytes[cursor + x * 3 + Math.floor(dy / 8)] & (0x80 >> (dy % 8)));
        expect(negro).toBe(y + dy < alto && pixeles[(y + dy) * ancho + x] < 128);
      }
      cursor += ancho * 3; expect(bytes[cursor++]).toBe(10);
    }
    expect(bytes.subarray(cursor)).toEqual(Buffer.from([27, 50, 27, 97, 0]));
  });

  it.each([1, 2])('el recibo de empresa %s utiliza el logo válido sin dañar el texto posterior', async empresaId => {
    const sharp = require('sharp');
    const png = await sharp({ create: { width: 9, height: 25, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const consulta = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => png } as any);
    const prisma = { empresa: { findUnique: jest.fn().mockResolvedValue({ nombre: 'Empresa de prueba', logo: 'https://example.test/logo.png' }) } };
    try {
      const service = new ImpresionService(prisma as any);
      const recibo = await (service as any).formatearRecibo({ numero: 'PRUEBA-1', total: 10000, detalles: [] }, empresaId);
      const inicio = recibo.indexOf(Buffer.from([27, 42, 33, 9, 0]));
      expect(inicio).toBeGreaterThanOrEqual(0);
      expect(recibo.subarray(inicio + 5, inicio + 5 + 27)).toEqual(Buffer.alloc(27)); // transparencia => papel blanco
      expect(recibo.toString('ascii')).toContain('PRUEBA-1');
      expect(recibo.toString('ascii')).toContain('$10.000');
    } finally { consulta.mockRestore(); }
  });
});
