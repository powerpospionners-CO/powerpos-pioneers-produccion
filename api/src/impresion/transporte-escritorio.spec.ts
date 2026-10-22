import {
  ejecutarImpresionEscritorio,
  prepararEnEscritorio,
} from './transporte-escritorio';
import { ImpresionService } from './impresion.service';
describe('Impresión local de escritorio', () => {
  it('prepara el cajón sin enviarlo al agente ni afirmar apertura física', async () => {
    const antes = process.env.ESC_POS_ENABLED;
    process.env.ESC_POS_ENABLED = 'true';
    const eventos = { enviarYEsperar: jest.fn() };
    try {
      const s = new ImpresionService(undefined, eventos as any);
      const r = await ejecutarImpresionEscritorio(true, () => s.abrirCajon(1));
      expect(r).toMatchObject({
        preparado: true,
        abierto: false,
        impreso: false,
        modo: 'escritorio',
      });
      expect(Buffer.from(r.trabajos[0].datosBase64, 'base64')).toEqual(
        Buffer.from([0x1b, 0x70, 0, 0x19, 0xfa]),
      );
      expect(eventos.enviarYEsperar).not.toHaveBeenCalled();
    } finally {
      if (antes === undefined) delete process.env.ESC_POS_ENABLED;
      else process.env.ESC_POS_ENABLED = antes;
    }
  });
  it('aísla los bytes de peticiones concurrentes', async () => {
    const r = await Promise.all(
      ['A', 'B'].map((texto) =>
        ejecutarImpresionEscritorio(true, async () => {
          await new Promise((r) => setTimeout(r, texto === 'A' ? 10 : 1));
          prepararEnEscritorio('TICKET', Buffer.from(texto));
          return {};
        }),
      ),
    );
    expect(
      r.map((x) => Buffer.from(x.trabajos[0].datosBase64, 'base64').toString()),
    ).toEqual(['A', 'B']);
    expect(prepararEnEscritorio('TICKET', Buffer.from('C'))).toBe(false);
  });
});
