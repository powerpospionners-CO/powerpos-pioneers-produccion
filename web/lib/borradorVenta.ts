// Un único documento por caja/usuario: cada cambio se escribe inmediatamente,
// antes de que una recarga pueda interrumpir la venta.
export function crearBorradorVenta<T extends object>(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null, clave: string, inicial: T) {
  let datos = inicial;
  let error = '';
  let recuperado = false;
  const listeners = new Set<() => void>();
  try {
    const texto = storage?.getItem(clave);
    if (texto) {
      const guardado = JSON.parse(texto);
      if (guardado.version !== 1 || !guardado.datos || !Array.isArray(guardado.datos.carrito)) throw new Error('Formato inválido');
      datos = { ...inicial, ...guardado.datos };
      recuperado = guardado.datos.carrito.length > 0;
    }
  } catch { error = 'No se pudo recuperar el borrador. No cierres esta página: el respaldo del equipo necesita revisión.'; }
  let snapshot = { datos, error, recuperado };
  function publicar() { snapshot = { datos, error, recuperado }; listeners.forEach(fn => fn()); }
  return {
    getSnapshot: () => snapshot,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    set<K extends keyof T>(campo: K, valor: T[K] | ((anterior: T[K]) => T[K])) {
      datos = { ...datos, [campo]: typeof valor === 'function' ? (valor as (v: T[K]) => T[K])(datos[campo]) : valor };
      try {
        if (!storage || error) throw new Error('Respaldo no disponible');
        storage.setItem(clave, JSON.stringify({ version: 1, datos }));
      } catch { error = 'No se pudo guardar el borrador en este equipo. No recargues ni cierres la página hasta terminar la venta.'; }
      publicar();
    },
    reiniciar() {
      datos = inicial;
      recuperado = false;
      try { storage?.removeItem(clave); error = ''; }
      catch { error = 'La venta se confirmó, pero no se pudo eliminar el borrador del equipo. No vuelvas a cobrarla.'; }
      publicar();
    },
  };
}
