'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, CheckCircle2, CreditCard, Headphones, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import { useAuthStore } from '@/store/authStore';

type Periodicidad = 'MENSUAL' | 'ANUAL';
type Estado = {
  plan: 'BASICO' | 'MEDIUM' | 'PREMIUM';
  suscripcionVenceEn: string | null;
  pagoExonerado: boolean;
  motivoExoneracion: string | null;
  soporteIncluidoHasta: string | null;
  soportePagadoHasta: string | null;
  accesoExento: boolean;
  precios: {
    soporteMensual: number;
    planes: Array<{ plan: string; nombre: string; mensual: number; anual: number }>;
  };
  pagos: Array<{
    referencia: string;
    plan: string;
    periodicidad: Periodicidad;
    monto: number;
    estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
    incluyeSoporte: boolean;
    creadoEn: string;
    pagadoEn: string | null;
  }>;
};

type Checkout = {
  publicKey: string;
  currency: string;
  amountInCents: number;
  reference: string;
  signature: { integrity: string };
  redirectUrl: string;
};

const moneda = (valor: number) => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
}).format(valor);

function SuscripcionContenido() {
  const router = useRouter();
  const { usuario } = useAuthStore();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>('MENSUAL');
  const [incluyeSoporte, setIncluyeSoporte] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState('');
  const [retornoWompi, setRetornoWompi] = useState(false);

  const cargarEstado = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/suscripciones/estado');
      setEstado(respuesta.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No fue posible consultar la suscripcion.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    setRetornoWompi(new URLSearchParams(window.location.search).get('resultado') === 'retorno');
  }, []);

  useEffect(() => {
    if (!usuario) return;
    if (usuario.rol !== 'ADMIN_EMPRESA') {
      router.replace('/pos');
      return;
    }
    void cargarEstado();
  }, [usuario, router, cargarEstado]);

  const iniciarPago = async () => {
    setPagando(true);
    setError('');
    try {
      const { data } = await api.post<Checkout>('/suscripciones/checkout', {
        periodicidad: estado?.pagoExonerado ? 'MENSUAL' : periodicidad,
        incluyeSoporte,
      });
      const parametros = new URLSearchParams({
        'public-key': data.publicKey,
        currency: data.currency,
        'amount-in-cents': String(data.amountInCents),
        reference: data.reference,
        'signature:integrity': data.signature.integrity,
        'redirect-url': data.redirectUrl,
      });
      window.location.assign(`https://checkout.wompi.co/p/?${parametros.toString()}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'No fue posible iniciar el pago.');
      setPagando(false);
    }
  };

  const plan = estado?.precios.planes.find((item) => item.plan === estado.plan);
  const montoPlan = plan ? (periodicidad === 'ANUAL' ? plan.anual : plan.mensual) : 0;
  const montoTotal = (estado?.pagoExonerado ? 0 : montoPlan) +
    (incluyeSoporte ? estado?.precios.soporteMensual || 0 : 0);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 text-white">
        <Navbar />
        <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
          <header>
            <p className="text-sm uppercase tracking-wider text-orange-400">Cuenta de {usuario?.empresa}</p>
            <h1 className="mt-1 text-3xl font-black">Suscripcion y pagos</h1>
            <p className="mt-2 text-gray-400">Gestiona el pago de tu plan y revisa el estado de la cobertura.</p>
          </header>

          {retornoWompi && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-blue-200">
              Wompi devolvio el navegador. Estamos verificando el pago con el servidor; el retorno no confirma por si solo que el pago haya sido aprobado.
              <button onClick={() => void cargarEstado()} className="ml-2 underline">Actualizar estado</button>
            </div>
          )}
          {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>}

          {cargando || !estado ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-gray-400">
              {cargando ? 'Cargando estado de suscripcion...' : 'No se pudo cargar el estado.'}
            </div>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <ShieldCheck className="text-orange-400" size={20} />
                  <p className="mt-4 text-sm text-gray-400">Plan</p>
                  <p className="mt-1 text-xl font-bold">{estado.plan === 'BASICO' ? 'Inicial' : estado.plan}</p>
                </div>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <CalendarClock className="text-blue-400" size={20} />
                  <p className="mt-4 text-sm text-gray-400">Vencimiento</p>
                  <p className="mt-1 text-xl font-bold">{estado.pagoExonerado ? 'Pago exonerado' : estado.suscripcionVenceEn ? new Date(estado.suscripcionVenceEn).toLocaleDateString('es-CO') : 'Sin vencimiento configurado'}</p>
                  {!estado.pagoExonerado && estado.suscripcionVenceEn && <p className="mt-1 text-xs text-gray-500">Incluye cinco dias de gracia despues de la fecha.</p>}
                </div>
                <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                  <Headphones className="text-emerald-400" size={20} />
                  <p className="mt-4 text-sm text-gray-400">Soporte</p>
                  <p className="mt-1 text-sm">Incluido hasta: {estado.soporteIncluidoHasta ? new Date(estado.soporteIncluidoHasta).toLocaleDateString('es-CO') : 'No configurado'}</p>
                  <p className="mt-1 text-sm">Pagado hasta: {estado.soportePagadoHasta ? new Date(estado.soportePagadoHasta).toLocaleDateString('es-CO') : 'Sin soporte adicional'}</p>
                </div>
              </section>

              {estado.pagoExonerado && <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-200">
                El plan de software esta exonerado{estado.motivoExoneracion ? `: ${estado.motivoExoneracion}` : '.'} El soporte opcional y los desarrollos personalizados se cobran por separado.
              </div>}
              {!estado.accesoExento && !estado.pagoExonerado && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                La suscripcion vencio y termino el periodo de gracia. Completa el pago para recuperar el acceso.
              </div>}

              <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 md:p-6">
                <div className="flex items-center gap-2"><CreditCard size={19} className="text-orange-400" /><h2 className="text-xl font-bold">Realizar un pago</h2></div>
                <p className="mt-2 text-sm text-gray-400">Pago manual seguro con Wompi. No se realizan cobros automaticos en futuras renovaciones.</p>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {!estado.pagoExonerado && <div className="rounded-xl border border-gray-800 p-4">
                    <p className="font-semibold">{plan?.nombre || 'Plan actual'}</p>
                    <div className="mt-3 flex gap-2">
                      {(['MENSUAL', 'ANUAL'] as const).map((opcion) => <button key={opcion} type="button" onClick={() => setPeriodicidad(opcion)} className={`rounded-lg border px-4 py-2 text-sm ${periodicidad === opcion ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-gray-700 text-gray-400'}`}>{opcion === 'MENSUAL' ? 'Mensual' : 'Anual'}</button>)}
                    </div>
                    <p className="mt-3 text-xl font-bold">{moneda(montoPlan)}</p>
                    <p className="mt-1 text-xs text-gray-500">{periodicidad === 'ANUAL' ? '12 meses de servicio; el descuento se configura en Superadmin.' : 'Renovacion por un mes.'}</p>
                  </div>}
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-800 p-4">
                    <input type="checkbox" checked={incluyeSoporte} onChange={(event) => setIncluyeSoporte(event.target.checked)} className="mt-1 accent-orange-500" />
                    <span><span className="block font-semibold">Agregar soporte opcional por un mes</span><span className="mt-1 block text-sm text-gray-400">{moneda(estado.precios.soporteMensual)}. Los desarrollos personalizados se cotizan aparte.</span></span>
                  </label>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-800 pt-4">
                  <p className="text-gray-300">Total de este pago: <strong className="ml-1 text-xl text-white">{moneda(montoTotal)}</strong></p>
                  <button type="button" disabled={pagando || montoTotal <= 0} onClick={() => void iniciarPago()} className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-3 font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                    <CheckCircle2 size={17} /> {pagando ? 'Conectando con Wompi...' : 'Pagar con Wompi'}
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Historial de pagos</h2><button onClick={() => void cargarEstado()} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"><RefreshCw size={14} /> Actualizar</button></div>
                {estado.pagos.length === 0 ? <p className="text-sm text-gray-500">Todavia no hay pagos registrados.</p> : <div className="divide-y divide-gray-800">
                  {estado.pagos.map((pago) => <div key={pago.referencia} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div><p className="font-medium">{pago.plan === 'BASICO' ? 'Inicial' : pago.plan} · {pago.periodicidad === 'ANUAL' ? 'Anual' : 'Mensual'}{pago.incluyeSoporte ? ' · Soporte' : ''}</p><p className="mt-1 text-xs text-gray-500">{new Date(pago.creadoEn).toLocaleDateString('es-CO')} · {pago.referencia}</p></div>
                    <div className="text-right"><p className="font-semibold">{moneda(pago.monto)}</p><p className={pago.estado === 'APROBADO' ? 'text-xs text-emerald-400' : pago.estado === 'PENDIENTE' ? 'text-xs text-amber-300' : 'text-xs text-red-400'}>{pago.estado === 'APROBADO' ? 'Aprobado' : pago.estado === 'PENDIENTE' ? 'Pendiente de confirmacion' : 'Rechazado'}</p></div>
                  </div>)}
                </div>}
              </section>
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}

export default function SuscripcionPage() {
  return <SuscripcionContenido />;
}
