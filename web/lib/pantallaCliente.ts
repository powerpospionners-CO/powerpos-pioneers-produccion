// Enlace de la tienda en línea para el QR de la pantalla del cliente. Usa el enlace del sistema, que siempre funciona
// aunque el subdominio propio aún no tenga DNS. Sin tienda publicada no hay QR.
export function qrTiendaCliente(empresa: { tiendaSlug?: unknown; tiendaConfig?: unknown } | null | undefined, dominio: string) {
  const slug = typeof empresa?.tiendaSlug === 'string' ? empresa.tiendaSlug : '';
  const config = empresa?.tiendaConfig && typeof empresa.tiendaConfig === 'object' ? (empresa.tiendaConfig as Record<string, unknown>) : {};
  if (!slug || config.publicada !== true) return null;
  return `https://app.${dominio}/tienda/${encodeURIComponent(slug)}`;
}
