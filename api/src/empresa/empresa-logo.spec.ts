import { EmpresaService } from './empresa.service';

describe('identidad de la tienda por empresa', () => {
  it.each([true, false])(
    'conserva ajustes y respeta coloresAutomaticos=%s',
    async (automatico) => {
      const config = {
        titulo: 'Mi tienda',
        color: '#123456',
        coloresAutomaticos: automatico,
        zonas: [{ nombre: 'Centro', costo: 5000 }],
      };
      const tx = {
        empresa: {
          findUniqueOrThrow: jest
            .fn()
            .mockResolvedValue({ tiendaConfig: config }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const prisma = {
        $transaction: jest.fn((callback: (db: typeof tx) => Promise<unknown>) =>
          callback(tx),
        ),
      };
      await new EmpresaService(prisma as never).actualizarLogo(
        7,
        '/uploads/logo.png',
        { principal: '#ff6a00', secundario: '#28551a' },
      );
      expect(tx.empresa.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 7 },
      });
      expect(tx.empresa.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          logo: '/uploads/logo.png',
          tiendaConfig: {
            ...config,
            color: automatico ? '#ff6a00' : '#123456',
            paletaLogo: { principal: '#ff6a00', secundario: '#28551a' },
          },
        },
      });
    },
  );
});
