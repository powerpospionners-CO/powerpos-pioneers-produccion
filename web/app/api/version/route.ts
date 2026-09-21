import { NextResponse } from 'next/server';

// Vercel asigna esta variable automáticamente en cada despliegue: cambia con
// cada commit publicado, así que sirve para detectar cuándo hay una versión
// nueva del sistema corriendo sin tener que mantener nada manualmente.
export const dynamic = 'force-dynamic';

export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || 'local';
  return NextResponse.json({ version });
}
