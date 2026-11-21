export function validarCapacitacion(env: NodeJS.ProcessEnv) {
  if (env.CAPACITACION !== 'true') return;
  const url = new URL(env.DATABASE_URL || '');
  if (url.protocol !== 'mysql:' || url.pathname !== '/u748056473_ppcapacitacion' || url.username !== 'u748056473_ppcapacitacion')
    throw new Error('Capacitación requiere su base MySQL exclusiva');
  if (env.DATABASE_ENGINE !== 'mysql' || env.BACKGROUND_JOBS_ENABLED !== 'false' || env.IMPRESION_MODO !== 'agente')
    throw new Error('Configuración de capacitación incompleta');
  for (const key of ['SMTP_USER','SMTP_PASS','WHATSAPP_ACCESS_TOKEN','WOMPI_PRIVATE_KEY','WOMPI_INTEGRITY_SECRET'])
    if (env[key]) throw new Error('Capacitación no admite credenciales de envíos ni pagos externos');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('Capacitación requiere una clave de sesión propia');
}

export function marcarImpresionCapacitacion(datos: Buffer): Buffer {
  if (process.env.CAPACITACION !== 'true') return datos;
  return Buffer.concat([
    Buffer.from('\x1b@PRUEBA / CAPACITACION\nSIN VALIDEZ COMERCIAL\n================================\n', 'ascii'),
    datos,
  ]);
}
