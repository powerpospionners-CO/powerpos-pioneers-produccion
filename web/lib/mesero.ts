// Perfil mesero: un usuario CAJERO con permisos.perfil = 'MESERO'. Toma pedidos en las mesas; no maneja la caja ni cobra.
export function esPerfilMesero(usuario: { rol?: string; permisosUsuario?: unknown } | null | undefined) {
  const permisos = usuario?.permisosUsuario as Record<string, unknown> | undefined;
  return usuario?.rol === 'CAJERO' && !!permisos && typeof permisos === 'object' && permisos.perfil === 'MESERO';
}
