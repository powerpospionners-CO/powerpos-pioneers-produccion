import { rutaConTokenEnEnlace } from '../auth/jwt.strategy';
import { cabecerasUploads, extensionImagen } from '../storage/uploads';

describe('Endurecimiento', () => {
  it('solo la transmisión de pedidos acepta la sesión en el enlace', () => {
    expect(rutaConTokenEnEnlace('/pedidos/stream?token=x')).toBe(true);
    expect(rutaConTokenEnEnlace('/usuarios?token=x')).toBe(false);
    expect(rutaConTokenEnEnlace('/pedidos/stream/otra')).toBe(false);
  });
  it('los archivos subidos toman la extensión de su tipo de imagen y se sirven sin ejecutar código', () => {
    expect(extensionImagen('image/png')).toBe('.png');
    expect(extensionImagen('image/jpeg')).toBe('.jpg');
    expect(extensionImagen('text/html')).toBe('.img');
    const cabeceras: Record<string, string> = {};
    cabecerasUploads({ setHeader: (k, v) => { cabeceras[k] = v; } });
    expect(cabeceras['Content-Security-Policy']).toContain('sandbox');
    expect(cabeceras['X-Content-Type-Options']).toBe('nosniff');
  });
});
