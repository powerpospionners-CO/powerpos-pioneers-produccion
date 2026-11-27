import { resolve } from 'node:path';

export function directorioUploads(carpeta?: 'logos' | 'anuncios' | 'productos' | 'catalogo') {
  const raiz = process.env.UPLOADS_PATH || resolve(process.cwd(), 'uploads');
  return carpeta ? resolve(raiz, carpeta) : resolve(raiz);
}

// La extensión del archivo guardado sale del tipo de imagen aceptado, nunca del nombre que envía el navegador:
// así un archivo disfrazado no puede quedar como .html o .svg y ejecutarse al servirlo.
const EXTENSIONES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
export function extensionImagen(mimetype: string) {
  return EXTENSIONES[String(mimetype || '').toLowerCase()] || '.img';
}

// Cabeceras para lo servido desde /uploads: no se interpreta como página ni ejecuta scripts.
export function cabecerasUploads(res: { setHeader(nombre: string, valor: string): void }) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}
