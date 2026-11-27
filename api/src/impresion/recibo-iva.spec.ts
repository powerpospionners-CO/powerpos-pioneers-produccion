import { ImpresionService } from './impresion.service';
import { configInicial } from '../iva/iva.reglas';

describe('IVA en el recibo', () => {
  const pedido = { total: 22400, detalles: [{ productoId: 1, subtotal: 11900 }, { productoId: 2, subtotal: 10500 }] };
  it('discrimina base e IVA por tarifa para empresas responsables', async () => {
    const iva: any = { config: jest.fn().mockResolvedValue({ ...configInicial(4), productos: { '1': 'IVA19', '2': 'IVA5' } }) };
    const s = new ImpresionService(undefined, undefined, iva);
    const lineas: string[] = await (s as any).lineasIva(pedido, 4, 32);
    expect(lineas.join('')).toMatch(/Base IVA 19 %\s+\$\s?10\.000/);
    expect(lineas.join('')).toMatch(/IVA 5 %\s+\$\s?500/);
  });
  it('no agrega nada para el Trailer ni si falla la configuración', async () => {
    const trailer = new ImpresionService(undefined, undefined, { config: jest.fn().mockResolvedValue(configInicial(1)) } as any);
    expect(await (trailer as any).lineasIva(pedido, 1, 32)).toEqual([]);
    const falla = new ImpresionService(undefined, undefined, { config: jest.fn().mockRejectedValue(new Error('x')) } as any);
    expect(await (falla as any).lineasIva(pedido, 4, 32)).toEqual([]);
  });
});
