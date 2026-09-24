// Descarga únicamente las imágenes revisadas del manifiesto. No modifica la BD.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..', '..');
async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'api/catalogo-enchila-imagenes.json'), 'utf8'));
  const out = path.join(root, 'api/.tmp/catalogo-fotos');
  await fs.mkdir(out, { recursive: true });
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < manifest.length) {
      const item = manifest[next++];
      try {
        if (!/^[a-z0-9-]+\.png$/.test(item.file)) throw new Error('Nombre no válido');
        const target = path.join(out, item.file);
        if (item.tipo === 'generada') {
          const bundled = path.join(root, 'web/public/catalogo-imagenes', item.file);
          await fs.copyFile(bundled, target);
          results.push({ file: item.file, ok: true, generated: true });
          continue;
        }
        const previous = await fs.readFile(target + '.source.json', 'utf8').catch(() => null);
        if (previous && JSON.parse(previous).url === item.url) { results.push({ file: item.file, ok: true, cached: true }); continue; }
        const response = await fetch(item.url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProductCatalogImageImport/1.0)' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > 20000000) throw new Error('Imagen demasiado grande');
        const metadata = await sharp(data).metadata();
        if (!metadata.width || metadata.width < 100 || !metadata.height || metadata.height < 100) throw new Error('Resolución insuficiente');
        await sharp(data).rotate().resize(600, 600, { fit: 'contain', background: '#ffffff', withoutEnlargement: true }).flatten({ background: '#ffffff' }).png({ palette: true, quality: 90 }).toFile(target);
        await fs.writeFile(target + '.source.json', JSON.stringify(item, null, 2));
        results.push({ file: item.file, ok: true });
      } catch (e) { results.push({ file: item.file, ok: false, error: e.message }); }
    }
  }));
  await fs.writeFile(path.join(root, 'api/.tmp/catalogo-descarga.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ok: results.filter(r => r.ok).length, errores: results.filter(r => !r.ok) }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
