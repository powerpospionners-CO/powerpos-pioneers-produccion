import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep, dirname } from 'node:path';

type ArchivoRespaldo = { readonly ruta: string; readonly bytes: number; readonly sha256: string };

export async function verificarUploads(raiz: string, archivos: readonly ArchivoRespaldo[], recuperarFaltantes = false) {
  const base = resolve(raiz);
  for (const archivo of archivos) {
    if (!/^\/uploads\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(archivo.ruta)) {
      throw new Error('Ruta de respaldo no válida');
    }
    const destino = resolve(base, archivo.ruta.slice('/uploads/'.length));
    if (!destino.startsWith(base + sep)) throw new Error('Ruta de respaldo fuera del almacenamiento');
    let contenido: Buffer;
    try { contenido = await readFile(destino); }
    catch (error) {
      if (!recuperarFaltantes || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Faltan archivos del respaldo de imágenes');
      // Solo archivos públicos incluidos en el manifiesto, durante el ensayo.
      const respuesta = await fetch('https://api.powerpospioneers.com' + archivo.ruta, {
        redirect: 'error', signal: AbortSignal.timeout(20000),
      });
      if (!respuesta.ok || !respuesta.headers.get('content-type')?.startsWith('image/') || archivo.bytes > 10 * 1024 * 1024) throw new Error('No se pudo recuperar la imagen original');
      contenido = Buffer.from(await respuesta.arrayBuffer());
      if (contenido.length !== archivo.bytes || createHash('sha256').update(contenido).digest('hex') !== archivo.sha256) throw new Error('La imagen recuperada no coincide con el respaldo');
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, contenido, { flag: 'wx' });
    }
    if (contenido.length !== archivo.bytes || createHash('sha256').update(contenido).digest('hex') !== archivo.sha256) {
      throw new Error('Las imágenes almacenadas no coinciden con el respaldo');
    }
  }
  return { archivosVerificados: archivos.length, integridadSha256: true };
}
