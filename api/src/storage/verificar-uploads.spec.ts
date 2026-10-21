import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verificarUploads } from './verificar-uploads';

describe('Integridad del respaldo de imágenes', () => {
  let raiz: string;
  const original = Buffer.from('imagen original de prueba');
  const archivo = { ruta: '/uploads/logos/prueba.jpg', bytes: original.length, sha256: createHash('sha256').update(original).digest('hex') };
  beforeEach(async () => { raiz = await mkdtemp(join(tmpdir(), 'powerpos-integridad-')); await mkdir(join(raiz, 'logos')); });
  afterEach(async () => {
    if (!raiz.startsWith(join(tmpdir(), 'powerpos-integridad-'))) throw new Error('Carpeta de prueba inesperada');
    await rm(raiz, { recursive: true, force: true });
  });
  it('compara los bytes originales en disco', async () => {
    await writeFile(join(raiz, 'logos/prueba.jpg'), original);
    await expect(verificarUploads(raiz, [archivo])).resolves.toEqual({ archivosVerificados: 1, integridadSha256: true });
  });
  it('rechaza archivos ausentes y contenido alterado del mismo tamaño', async () => {
    await expect(verificarUploads(raiz, [archivo])).rejects.toThrow('Faltan archivos');
    await writeFile(join(raiz, 'logos/prueba.jpg'), Buffer.alloc(original.length));
    await expect(verificarUploads(raiz, [archivo])).rejects.toThrow('no coinciden');
  });
  it('impide leer fuera de la carpeta del respaldo', async () => {
    await expect(verificarUploads(raiz, [{ ...archivo, ruta: '/uploads/../otro.jpg' }])).rejects.toThrow('Ruta de respaldo');
  });
});
