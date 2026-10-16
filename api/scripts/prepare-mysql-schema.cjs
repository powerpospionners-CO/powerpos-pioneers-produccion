// Offline compatibility draft. Never connects to or alters either database.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
let schema = source.replace('provider = "postgresql"', 'provider = "mysql"')
  .replace('env("DATABASE_URL")', 'env("MYSQL_DATABASE_URL")')
  .replace('provider      = "prisma-client-js"', 'provider      = "prisma-client-js"\n  output = "../../generated/prisma-mysql"');
schema = schema.replace(/(\w+\s+)String\[\](\s+@default\(\[\]\))?/g, '$1Json @default("[]")');
schema = schema.replace(/model\s+\w+\s*\{[\s\S]*?\n\}/g, block => {
  const indexed = new Set();
  for (const line of block.split('\n')) {
    const field = line.match(/^\s*(\w+)\s+String\??\s+.*@(?:unique|id)\b/);
    if (field) indexed.add(field[1]);
    const compound = line.match(/@@(?:unique|index)\(\[([^\]]+)\]/);
    if (compound) compound[1].split(',').forEach(f => indexed.add(f.trim().split('(')[0]));
  }
  // Avoid truncating unrestricted PostgreSQL text to MySQL's default VARCHAR.
  return block.replace(/^(\s*)(\w+)(\s+)String(\??)([^\n]*)$/gm, (line, space, field, gap, optional, attrs) => {
    if (indexed.has(field) || /@db\./.test(attrs)) return line;
    return `${space}${field}${gap}String${optional} @db.LongText${attrs}`;
  });
});
const folder = path.join(root,'prisma/mysql');
const target = path.join(folder,'schema.prisma');
const header = '// Generated compatibility draft; production still uses PostgreSQL.\n// Regenerate with node scripts/prepare-mysql-schema.cjs.\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target,'utf8') !== header + schema) { console.error('El borrador MySQL requiere regeneración'); process.exitCode = 1; }
  else console.log('Borrador MySQL actualizado; no se modificaron bases de datos');
} else {
  fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(target,header + schema);
  console.log('Borrador MySQL generado por separado; no se modificaron bases de datos');
}
