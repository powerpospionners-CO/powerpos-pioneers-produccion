import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

type ArchivoRespaldo = { readonly ruta: string; readonly bytes: number; readonly sha256: string };

export async function verificarUploads(raiz: string, archivos: readonly ArchivoRespaldo[]) {
  const base = resolve(raiz);
  for (const archivo of archivos) {
    if (!/^\/uploads\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(archivo.ruta)) {
      throw new Error('Ruta de respaldo no válida');
    }
    const destino = resolve(base, archivo.ruta.slice('/uploads/'.length));
    if (!destino.startsWith(base + sep)) throw new Error('Ruta de respaldo fuera del almacenamiento');
    let contenido: Buffer;
    try { contenido = await readFile(destino); }
    catch { throw new Error('Faltan archivos del respaldo de imágenes'); }
    if (contenido.length !== archivo.bytes || createHash('sha256').update(contenido).digest('hex') !== archivo.sha256) {
      throw new Error('Las imágenes almacenadas no coinciden con el respaldo');
    }
  }
  return { archivosVerificados: archivos.length, integridadSha256: true };
}
