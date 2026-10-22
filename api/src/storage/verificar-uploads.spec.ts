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
  it('recupera únicamente imágenes faltantes cuyos bytes coinciden con el respaldo', async () => {
    const descarga = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(original, { headers: { 'content-type': 'image/jpeg' } }));
    try {
      await expect(verificarUploads(raiz, [archivo], true)).resolves.toEqual({ archivosVerificados: 1, integridadSha256: true });
      descarga.mockClear();
      await verificarUploads(raiz, [archivo], true);
      expect(descarga).not.toHaveBeenCalled();
    } finally { descarga.mockRestore(); }
  });
  it('rechaza una descarga alterada sin guardarla', async () => {
    const descarga = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('alterada', { headers: { 'content-type': 'image/jpeg' } }));
    try {
      await expect(verificarUploads(raiz, [archivo], true)).rejects.toThrow('no coincide');
      await expect(verificarUploads(raiz, [archivo])).rejects.toThrow('Faltan archivos');
    } finally { descarga.mockRestore(); }
  });
});
