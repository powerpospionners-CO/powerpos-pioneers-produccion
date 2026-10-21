import { NextResponse } from 'next/server';

// La compilación fija este valor en cualquier proveedor de alojamiento.
export const dynamic = 'force-dynamic';

export async function GET() {
  const version = process.env.POWERPOS_BUILD_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || 'local';
  return NextResponse.json({ version });
}
