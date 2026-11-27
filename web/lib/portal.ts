// Dirección del portal general cuando el superadministrador entra por el dominio de una empresa
// (p. ej. enchila.powerpospioneers.com). En app.<dominio>, localhost u otros hosts devuelve null.
export function portalSuperadmin(host: string, dominio = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'powerpospioneers.com') {
  const nombre = String(host || '').toLowerCase().split(':')[0];
  const sufijo = `.${dominio}`;
  if (!nombre.endsWith(sufijo)) return null;
  const sub = nombre.slice(0, -sufijo.length);
  if (!sub || sub.includes('.') || ['app', 'www', 'api'].includes(sub)) return null;
  return `https://app.${dominio}/login`;
}
