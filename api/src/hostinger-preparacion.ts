/** Entrada temporal para verificar el alojamiento sin acceder a datos ni tareas. */
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 3000);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Puerto no válido');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200);
    res.end(JSON.stringify({ servicio: 'PowerPOS', estado: 'alojamiento-preparado', migracionCompletada: false }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ mensaje: 'Aplicación en preparación' }));
  }
});
server.listen(port, '0.0.0.0');
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
