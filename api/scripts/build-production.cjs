const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Hostinger detecta el comando estándar; el motor selecciona el cliente incluido.
const archivo = process.env.DATABASE_ENGINE === 'mysql'
  ? path.join(__dirname, 'build-mysql.cjs')
  : require.resolve('@nestjs/cli/bin/nest.js');
const args = process.env.DATABASE_ENGINE === 'mysql' ? [] : ['build'];
const resultado = spawnSync(process.execPath, [archivo, ...args], {
  cwd: path.join(__dirname, '..'), stdio: 'inherit', env: process.env,
});
if (resultado.error) throw resultado.error;
process.exit(resultado.status ?? 1);
