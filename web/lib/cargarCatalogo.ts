// Solo consultas GET: nunca reenvía pedidos o pagos ni reutiliza precios antiguos.
export async function cargarCatalogo(url: string): Promise<Response> {
  for (let intento = 0; intento < 2; intento++) {
    try {
      const respuesta = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(intento === 0 ? 15000 : 20000),
      });
      if (intento === 0 && [502, 503, 504].includes(respuesta.status)) {
        await respuesta.body?.cancel();
        continue;
      }
      return respuesta;
    } catch (error) {
      const recuperable = error instanceof Error &&
        ["TimeoutError", "AbortError", "TypeError"].includes(error.name);
      if (intento > 0 || !recuperable) throw error;
    }
  }
  throw new Error("No fue posible consultar el catálogo");
}
