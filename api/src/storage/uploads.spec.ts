import { resolve } from 'node:path';
import { directorioUploads } from './uploads';

describe('Almacenamiento persistente de imágenes', () => {
  const anterior = process.env.UPLOADS_PATH;
  afterEach(() => {
    if (anterior === undefined) delete process.env.UPLOADS_PATH;
    else process.env.UPLOADS_PATH = anterior;
  });
  it('conserva la carpeta actual cuando no se configura otra', () => {
    delete process.env.UPLOADS_PATH;
    expect(directorioUploads('logos')).toBe(resolve(process.cwd(), 'uploads', 'logos'));
  });
  it('usa la misma raíz persistente para las nuevas subidas y el servidor estático', () => {
    process.env.UPLOADS_PATH = resolve(process.cwd(), 'almacen-persistente');
    expect(directorioUploads('catalogo')).toBe(resolve(directorioUploads(), 'catalogo'));
    expect(directorioUploads('productos')).toBe(resolve(process.cwd(), 'almacen-persistente', 'productos'));
  });
});
