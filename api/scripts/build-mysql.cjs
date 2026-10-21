const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function ejecutar(archivo, argumentos) {
  const r = spawnSync(process.execPath, [archivo, ...argumentos], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, MYSQL_DATABASE_URL: process.env.MYSQL_DATABASE_URL || 'mysql://build:build@127.0.0.1:3306/build' },
  });
  if (r.error || r.status !== 0) throw new Error('No se pudo preparar la compilación MySQL');
}
try {
  ejecutar(path.join(__dirname, 'prepare-mysql-schema.cjs'), []);
  ejecutar(require.resolve('prisma/build/index.js'), ['generate', '--schema', 'prisma/mysql/schema.prisma']);
  ejecutar(require.resolve('@nestjs/cli/bin/nest.js'), ['build']);
  fs.cpSync(path.join(root, 'generated/prisma-mysql'), path.join(root, 'dist/generated/prisma-mysql'), { recursive: true });
  console.log('Cliente MySQL incluido en dist; no se modificaron bases de datos');
} catch (e) { console.error(e.message); process.exitCode = 1; }
