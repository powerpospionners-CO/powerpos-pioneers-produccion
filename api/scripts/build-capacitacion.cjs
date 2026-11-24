// Artefacto autónomo para Hostinger: solo se usa en la rama de capacitación.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const r = spawnSync(process.execPath, [path.join(__dirname, 'build-mysql.cjs')], { cwd: root, stdio: 'inherit', env: process.env });
if (r.error || r.status !== 0) process.exit(r.status || 1);
fs.copyFileSync(path.join(__dirname, 'iniciar-capacitacion.cjs'), path.join(root, 'dist/iniciar-capacitacion.cjs'));
fs.copyFileSync(path.join(root, 'prisma/mysql/schema.prisma'), path.join(root, 'dist/prisma/mysql/schema.prisma'));
