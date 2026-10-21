import { resolve } from 'node:path';

export function directorioUploads(carpeta?: 'logos' | 'anuncios' | 'productos' | 'catalogo') {
  const raiz = process.env.UPLOADS_PATH || resolve(process.cwd(), 'uploads');
  return carpeta ? resolve(raiz, carpeta) : resolve(raiz);
}
