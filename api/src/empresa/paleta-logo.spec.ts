import * as sharpModule from 'sharp';
const sharp = sharpModule as unknown as typeof sharpModule.default;
import { analizarLogo } from './paleta-logo';

describe('colores del logo', () => {
  it('prioriza la marca aunque el fondo crema ocupe casi toda la imagen', async () => {
    const marca = await sharp({
      create: { width: 15, height: 15, channels: 4, background: '#ff6a00' },
    })
      .png()
      .toBuffer();
    const logo = await sharp({
      create: { width: 100, height: 100, channels: 4, background: '#fcedd1' },
    })
      .composite([{ input: marca, left: 40, top: 40 }])
      .png()
      .toBuffer();
    const color = (await analizarLogo(logo)).principal;
    expect(parseInt(color.slice(1, 3), 16)).toBeGreaterThan(250);
    expect(parseInt(color.slice(5, 7), 16)).toBeLessThan(10);
  });
  it('elige la marca naranja sobre el fondo blanco y negro', async () => {
    const logo = await sharp({
      create: { width: 100, height: 100, channels: 4, background: '#ffffff' },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 40,
              height: 40,
              channels: 4,
              background: '#ff6a00',
            },
          })
            .png()
            .toBuffer(),
          left: 30,
          top: 30,
        },
      ])
      .png()
      .toBuffer();
    const color = (await analizarLogo(logo)).principal;
    expect(parseInt(color.slice(1, 3), 16)).toBeGreaterThan(250);
    expect(Math.abs(parseInt(color.slice(3, 5), 16) - 106)).toBeLessThanOrEqual(
      2,
    );
    expect(parseInt(color.slice(5, 7), 16)).toBeLessThanOrEqual(2);
  });
  it('ignora el RGB de píxeles transparentes', async () => {
    const logo = await sharp({
      create: {
        width: 50,
        height: 50,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 20,
              height: 20,
              channels: 4,
              background: '#164ccc',
            },
          })
            .png()
            .toBuffer(),
          left: 10,
          top: 10,
        },
      ])
      .png()
      .toBuffer();
    expect((await analizarLogo(logo)).principal).toBe('#164ccc');
  });
  it('permite logos monocromáticos y rechaza archivos corruptos', async () => {
    const logo = await sharp({
      create: { width: 10, height: 10, channels: 4, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    expect(await analizarLogo(logo)).toEqual({
      principal: '#282828',
      secundario: '#282828',
    });
    await expect(analizarLogo(Buffer.from('no es imagen'))).rejects.toThrow();
  });
});
