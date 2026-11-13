import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { directorioUploads } from '../storage/uploads';
import { analizarLogo, type PaletaLogo } from './paleta-logo';
const cache = new Map<
  string,
  { fecha: number; valor: Promise<PaletaLogo | null> }
>();

/** Compatibilidad con logos anteriores: solo archivos locales, nunca peticiones remotas. */
export async function paletaLogoLocal(
  logo: string | null,
): Promise<PaletaLogo | null> {
  if (!logo) return null;
  let archivo: string;
  try {
    const ruta = new URL(logo, 'https://local.invalid').pathname;
    const match =
      /^\/uploads\/logos\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|gif|webp))$/i.exec(
        ruta,
      );
    if (!match) return null;
    archivo = join(directorioUploads('logos'), match[1]);
  } catch {
    return null;
  }
  const previa = cache.get(archivo);
  if (previa && Date.now() - previa.fecha < 600000) return previa.valor;
  if (cache.size >= 512) {
    for (const antigua of cache.keys()) {
      cache.delete(antigua);
      break;
    }
  }
  const valor = (async () => {
    try {
      const info = await stat(archivo);
      if (!info.isFile() || info.size > 8 * 1024 * 1024) return null;
      return await analizarLogo(await readFile(archivo));
    } catch {
      return null;
    }
  })();
  cache.set(archivo, { fecha: Date.now(), valor });
  return valor;
}
