import { readFile, stat } from 'node:fs/promises';
import { analizarLogo } from './paleta-logo';
import { paletaLogoLocal } from './paleta-logo-local';
jest.mock('node:fs/promises', () => ({ readFile: jest.fn(), stat: jest.fn() }));
jest.mock('./paleta-logo', () => ({ analizarLogo: jest.fn() }));

describe('paleta de logos históricos', () => {
  beforeEach(() => jest.clearAllMocks());
  it('analiza un logo local y comparte el resultado entre consultas concurrentes', async () => {
    jest
      .mocked(stat)
      .mockResolvedValue({ isFile: () => true, size: 100 } as Awaited<
        ReturnType<typeof stat>
      >);
    jest.mocked(readFile).mockResolvedValue(Buffer.from('imagen'));
    jest
      .mocked(analizarLogo)
      .mockResolvedValue({ principal: '#ff6a00', secundario: '#28551a' });
    const url = 'https://api.example.com/uploads/logos/logo-cache.png';
    const valores = await Promise.all([
      paletaLogoLocal(url),
      paletaLogoLocal(url),
    ]);
    expect(valores[0]?.principal).toBe('#ff6a00');
    expect(valores[1]).toEqual(valores[0]);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(analizarLogo).toHaveBeenCalledTimes(1);
  });
  it.each([
    'https://example.com/logo.png',
    'https://example.com/uploads/logos/../secret.png',
    '/etc/passwd',
    null,
  ])('rechaza archivos fuera del directorio permitido: %s', async (url) => {
    expect(await paletaLogoLocal(url)).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });
  it('no lee archivos demasiado grandes ni interrumpe la tienda si falta el logo', async () => {
    jest
      .mocked(stat)
      .mockResolvedValue({ isFile: () => true, size: 9000000 } as Awaited<
        ReturnType<typeof stat>
      >);
    expect(await paletaLogoLocal('/uploads/logos/logo-grande.png')).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
    jest.mocked(stat).mockRejectedValue(new Error('archivo ausente'));
    expect(await paletaLogoLocal('/uploads/logos/logo-ausente.png')).toBeNull();
  });
});
