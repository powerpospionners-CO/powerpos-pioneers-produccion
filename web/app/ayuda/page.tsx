'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';
import { esPerfilMesero } from '@/lib/mesero';
import { guiasPara } from '@/lib/ayuda';

// Contacto opcional de soporte, configurado al desplegar.
const WHATSAPP = (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP || '').replace(/\D/g, '');
const CORREO = process.env.NEXT_PUBLIC_SOPORTE_CORREO || '';

export default function AyudaPage() {
  const usuario = useAuthStore((s) => s.usuario);
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const mesero = esPerfilMesero(usuario);
  const guias = useMemo(() => guiasPara(usuario?.rol, busqueda).filter((g) => !mesero || g.tema === 'Mesas' || g.tema === 'Seguridad'), [usuario?.rol, busqueda, mesero]);
  const temas = [...new Set(guias.map((g) => g.tema))];
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
          <h1 className="text-2xl font-bold">Centro de ayuda</h1>
          <input aria-label="Buscar en la ayuda" placeholder="¿Qué necesitas hacer? Ej.: cerrar caja, mesero, propinas" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-3" />
          {!guias.length && <p className="text-gray-400">No encontramos una guía con esa búsqueda.</p>}
          {temas.map((tema) => (
            <section key={tema} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{tema}</h2>
              {guias.filter((g) => g.tema === tema).map((g) => (
                <article key={g.id} className="rounded-xl border border-gray-800 bg-gray-900">
                  <button type="button" aria-expanded={abierta === g.id} onClick={() => setAbierta(abierta === g.id ? null : g.id)} className="flex w-full items-center justify-between px-4 py-3 text-left font-semibold">
                    {g.titulo}<span aria-hidden className="text-gray-500">{abierta === g.id ? '−' : '+'}</span>
                  </button>
                  {abierta === g.id && (
                    <div className="space-y-3 px-4 pb-4 text-sm text-gray-300">
                      <ol className="list-decimal space-y-1 pl-5">{g.pasos.map((p) => <li key={p}>{p}</li>)}</ol>
                      {g.notas?.map((n) => <p key={n} className="text-amber-200">{n}</p>)}
                      {g.ruta && <Link href={g.ruta} className="inline-block rounded-lg bg-orange-500 px-3 py-2 font-bold text-white">Ir a la pantalla</Link>}
                    </div>
                  )}
                </article>
              ))}
            </section>
          ))}
          {(WHATSAPP || CORREO) && (
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h2 className="font-semibold">¿Necesitas más ayuda?</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {WHATSAPP && <a href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola, necesito ayuda con PowerPOS')}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-green-600 px-3 py-2 font-bold">Escribir por WhatsApp</a>}
                {CORREO && <a href={`mailto:${CORREO}`} className="rounded-lg border border-gray-600 px-3 py-2">Escribir un correo</a>}
              </div>
            </section>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
