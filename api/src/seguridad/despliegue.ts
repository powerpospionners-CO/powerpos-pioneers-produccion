export function validarDespliegue(env: NodeJS.ProcessEnv) {
  const procesos = Number(env.WEB_CONCURRENCY || '1');
  if (!Number.isSafeInteger(procesos) || procesos < 1)
    throw new Error('WEB_CONCURRENCY debe ser un entero positivo');
  if (procesos > 1 && env.EVENTOS_COMPARTIDOS !== 'true')
    throw new Error(
      'Varias instancias requieren EVENTOS_COMPARTIDOS=true y su migración aplicada',
    );
  // No deducir confianza en el proxy a partir de cabeceras enviadas por clientes.
  const proxies = (env.TRUSTED_PROXIES || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (
    proxies.some(
      (v) =>
        !/^(loopback|linklocal|uniquelocal|[\da-fA-F:.]+(?:\/\d{1,3})?)$/.test(
          v,
        ),
    )
  )
    throw new Error(
      'TRUSTED_PROXIES debe contener IPs o redes de proxies de confianza',
    );
  return proxies;
}
