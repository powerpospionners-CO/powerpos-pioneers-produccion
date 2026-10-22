export function rutaImpresionEscritorio(ruta: string) {
  return (
    /^\/impresion\/(ticket|comanda|comandas|abrir-cajon)$/.test(ruta) ||
    /^\/caja\/(\d+\/(cerrar|reimprimir-cierre)|reimprimir-mi-cierre)$/.test(
      ruta,
    )
  );
}
declare global {
  interface Window {
    powerposDesktop?: {
      version: string;
      imprimir: (solicitud: {
        ruta: string;
        token: string;
        datos: Record<string, unknown>;
      }) => Promise<{ status: number; data: any }>;
      configurar: () => Promise<boolean>;
    };
  }
}
