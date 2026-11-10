import api from './api';

function mensajeError(error: unknown) {
  const e = error as { response?: { data?: { message?: unknown }; status?: number }; message?: string };
  const mensaje = e?.response?.data?.message;
  if (typeof mensaje === 'string' && mensaje) return mensaje;
  if (e?.response?.status === 500) return 'El servidor no pudo guardar el cierre. El conteo se conserva en pantalla.';
  return 'No se pudo comunicar el cierre al servidor. El conteo se conserva en pantalla.';
}

export async function guardarCierreCaja(id: number, datos: { montoFinal: number; montoRetirado?: number }) {
  const impresionLocal = typeof window !== 'undefined' && !!window.powerposDesktop;
  try {
    // El cierre usa la conexión normal del POS. El puente solo se utiliza
    // después, para imprimir un cierre que ya quedó confirmado.
    const { data } = await api.post(`/caja/${id}/cerrar`, { ...datos, ...(impresionLocal ? { imprimir: false } : {}) });
    if (data?.estado !== 'CERRADA') throw new Error('Respuesta de cierre sin confirmar');
    return { impresionLocal, recuperado: false };
  } catch (error) {
    const estadoHttp = (error as { response?: { status?: number } })?.response?.status;
    if (estadoHttp && estadoHttp < 500) throw new Error(mensajeError(error));
    // Una respuesta perdida no significa que el commit haya fallado. Consultar
    // el estado antes de sugerir un reintento; nunca reenviar dinero ni papel.
    let abierta: { id: number } | null;
    try {
      abierta = (await api.get('/caja/abierta')).data;
      if (abierta !== null && (!abierta || !Number.isSafeInteger(abierta.id))) throw new Error('Estado de caja sin confirmar');
    } catch {
      throw new Error('No se pudo confirmar si el cierre quedó guardado. Se conserva el conteo; revisa el estado de la caja al recuperar la conexión antes de intentarlo otra vez.');
    }
    if (abierta?.id === id) throw new Error(mensajeError(error));
    return { impresionLocal: false, recuperado: true };
  }
}

export async function imprimirCierreGuardado(id: number, rol?: string): Promise<string | null> {
  try {
    const ruta = rol === 'ADMIN_EMPRESA' || rol === 'GERENTE' ? `/caja/${id}/reimprimir-cierre` : '/caja/reimprimir-mi-cierre';
    const { data } = await api.post(ruta);
    return data?.impreso ? null : 'La caja quedó cerrada, pero no se confirmó la impresión de la colilla. Revisa el papel antes de usar Reimprimir cierre.';
  } catch {
    return 'La caja quedó cerrada. Falló la comunicación con la impresora; revisa el papel y usa Reimprimir cierre si hace falta.';
  }
}
