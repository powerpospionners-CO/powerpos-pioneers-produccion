/** Ordena trabajos del agente sin retener el flujo de ventas. */
export function crearColaImpresion() {
  let anterior: Promise<unknown> = Promise.resolve();
  return {
    encolar<T>(trabajo: () => Promise<T>): Promise<T> {
      const actual = anterior.then(trabajo, trabajo);
      anterior = actual.catch(() => undefined);
      return actual;
    },
  };
}
