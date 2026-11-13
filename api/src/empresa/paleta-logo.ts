import * as sharpModule from 'sharp';
const sharp = sharpModule as unknown as typeof sharpModule.default;

export type PaletaLogo = { principal: string; secundario: string };
const hex = (rgb: number[]) =>
  '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Muestreo acotado y cuantización: ignora transparencia y el fondo blanco. */
export async function analizarLogo(imagen: Buffer): Promise<PaletaLogo> {
  const { data, info } = await sharp(imagen, { limitInputPixels: 25000000 })
    .rotate()
    .resize(96, 96, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const grupos = new Map<
    string,
    { rgb: number[]; peso: number; cantidad: number }
  >();
  for (let i = 0; i < data.length; i += info.channels) {
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const alpha = data[i + 3] / 255;
    const max = Math.max(...rgb),
      min = Math.min(...rgb);
    if (alpha < 0.5 || min > 238) continue;
    const saturacion = max ? (max - min) / max : 0;
    const peso = alpha * (0.1 + saturacion * 2) * (max < 35 ? 0.15 : 1);
    const clave = rgb.map((v) => Math.floor(v / 32)).join(',');
    const grupo = grupos.get(clave) || { rgb: [0, 0, 0], peso: 0, cantidad: 0 };
    grupo.rgb = grupo.rgb.map((v, j) => v + rgb[j] * peso);
    grupo.peso += peso;
    grupo.cantidad++;
    grupos.set(clave, grupo);
  }
  const ordenados = [...grupos.values()]
    .sort((a, b) => b.peso - a.peso)
    .map((g) => ({ rgb: g.rgb.map((v) => v / g.peso), cantidad: g.cantidad }));
  // El fondo crema/gris suele ocupar más superficie que la marca. Priorizar
  // los grupos cromáticos significativos; conservar el caso monocromático.
  const cromaticos = ordenados.filter(({ rgb, cantidad }) => {
    const max = Math.max(...rgb),
      min = Math.min(...rgb);
    return (
      max > 60 &&
      max - min >= 50 &&
      (max - min) / max >= 0.35 &&
      cantidad >= info.width * info.height * 0.005
    );
  });
  const colores = [
    ...cromaticos,
    ...ordenados.filter((c) => !cromaticos.includes(c)),
  ].map((c) => c.rgb);
  const principal = colores[0] || [40, 40, 40];
  const secundario =
    colores.find(
      (c) => Math.hypot(...c.map((v, i) => v - principal[i])) > 100,
    ) || principal;
  return { principal: hex(principal), secundario: hex(secundario) };
}
