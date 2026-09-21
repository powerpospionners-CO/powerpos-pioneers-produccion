'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { Keyboard, Moon, Sun, Mail, Lock, Zap, Printer, Store, ArrowRight } from 'lucide-react';
import TouchKeyboard from '@/components/TouchKeyboard';
import { useTema } from '@/components/ThemeProvider';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'powerpospioneers.com';

function rutaPorRol(rol: string) {
  switch (rol) {
    case 'SUPERADMIN': return '/superadmin';
    case 'ADMIN_EMPRESA':
    case 'GERENTE': return '/dashboard';
    case 'CAJERO': return '/pos';
    case 'COCINERO': return '/cocina';
    case 'DOMICILIARIO': return '/domicilios';
    default: return '/pos';
  }
}

const DESTACADOS = [
  { icon: Zap, texto: 'Ventas y comandas en segundos, hechas para el ritmo de tu negocio.' },
  { icon: Printer, texto: 'Impresión automática de tickets y comandas en tu impresora térmica.' },
  { icon: Store, texto: 'Tu propia tienda en línea, con tu marca y tu dominio.' },
];

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { tema, cambiarTema } = useTema();
  const claro = tema === 'claro';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tecladoVisible, setTecladoVisible] = useState(false);
  const [campoActivo, setCampoActivo] = useState<'email' | 'password'>('email');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const usuario = data.usuario;
      const destino = rutaPorRol(usuario.rol);

      // El login es genérico (una sola puerta para todas las empresas), pero
      // si el usuario pertenece a una empresa con su propio subdominio de
      // marca, lo mandamos allá para que trabaje bajo esa dirección — la
      // sesión se guarda por separado en cada dominio, por eso el traspaso.
      const hostActual = window.location.hostname;
      const enDominioReal = hostActual === ROOT_DOMAIN || hostActual.endsWith(`.${ROOT_DOMAIN}`);
      const hostDestino = usuario.tiendaSlug ? `${usuario.tiendaSlug}.${ROOT_DOMAIN}` : null;

      if (enDominioReal && hostDestino && hostActual !== hostDestino) {
        const datosUsuario = encodeURIComponent(btoa(JSON.stringify(usuario)));
        window.location.href = `https://${hostDestino}/auth/callback?token=${encodeURIComponent(data.access_token)}&u=${datosUsuario}&next=${encodeURIComponent(destino)}`;
        return;
      }

      setAuth(data.access_token, usuario);
      router.push(destino);
    } catch {
      setError('Credenciales inválidas. Verifica tu email y contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex ${claro ? 'bg-orange-50' : 'bg-gray-950'}`}>
      {/* Panel de marca — visible en pantallas medianas en adelante */}
      <div className="hidden lg:flex lg:w-[46%] relative overflow-hidden bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 text-white flex-col justify-between p-12 xl:p-16">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-black/10 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="relative">
          <h1 className="text-3xl xl:text-4xl font-bold">
            Power<span className="text-gray-900/80">POS</span>
          </h1>
          <p className="mt-1 text-orange-100 font-medium">Pioneers</p>
        </div>
        <div className="relative space-y-8 fade-in-up">
          <h2 className="text-3xl xl:text-4xl font-extrabold leading-tight">
            El sistema que hace crecer tu negocio, de principio a fin.
          </h2>
          <ul className="space-y-5">
            {DESTACADOS.map(({ icon: Icon, texto }) => (
              <li key={texto} className="flex items-start gap-4">
                <span className="mt-0.5 flex-shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-white/15 backdrop-blur">
                  <Icon size={19} />
                </span>
                <p className="text-orange-50 leading-snug">{texto}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-orange-100/80">
          Punto de venta para restaurantes, tiendas y negocios en Colombia.
        </p>
      </div>

      {/* Panel de acceso */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative">
        <div className="w-full max-w-md fade-in-up">
          <div className="text-center mb-8 lg:hidden">
            <h1 className={`text-4xl font-bold mb-2 ${claro ? 'text-gray-900' : 'text-white'}`}>
              Power<span className="text-orange-500">POS</span>
            </h1>
            <p className={claro ? 'text-gray-500' : 'text-gray-400'}>Pioneers — Sistema de punto de venta para tu negocio</p>
          </div>

          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={cambiarTema}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                claro ? 'border-gray-300 bg-white text-gray-600 hover:border-orange-400' : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-orange-500'
              }`}
              aria-label={`Cambiar a tema ${claro ? 'oscuro' : 'claro'}`}
            >
              {claro ? <Moon size={16} /> : <Sun size={16} />}
              {claro ? 'Tema oscuro' : 'Tema claro'}
            </button>
          </div>

          <div className={`rounded-2xl p-8 border shadow-xl ${claro ? 'bg-white border-gray-200 shadow-orange-100' : 'bg-gray-900 border-gray-800 shadow-black/40'}`}>
            <div className="flex items-center justify-between mb-1">
              <h2 className={`text-2xl font-bold ${claro ? 'text-gray-900' : 'text-white'}`}>Bienvenido</h2>
              <button
                type="button"
                onClick={() => setTecladoVisible((prev) => !prev)}
                title="Teclado en pantalla"
                className={`p-2 rounded-lg border transition-colors ${
                  tecladoVisible
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : claro
                      ? 'bg-gray-100 border-gray-200 text-gray-500 hover:text-orange-600'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                <Keyboard size={18} />
              </button>
            </div>
            <p className={`text-sm mb-6 ${claro ? 'text-gray-500' : 'text-gray-400'}`}>Ingresa tus datos para continuar</p>

            {error && (
              <div className={`rounded-lg p-3 mb-4 text-sm border ${claro ? 'bg-red-50 border-red-200 text-red-600' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${claro ? 'text-gray-700' : 'text-gray-400'}`}>Email</label>
                <div className="relative">
                  <Mail size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${claro ? 'text-gray-400' : 'text-gray-500'}`} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setCampoActivo('email')}
                    className={`w-full rounded-lg pl-10 pr-4 py-3 border transition-colors focus:outline-none focus:border-orange-500 ${
                      claro ? 'bg-white border-gray-300 text-gray-900 placeholder-gray-400' : 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                    }`}
                    placeholder="tu@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1.5 ${claro ? 'text-gray-700' : 'text-gray-400'}`}>Contraseña</label>
                <div className="relative">
                  <Lock size={17} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${claro ? 'text-gray-400' : 'text-gray-500'}`} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setCampoActivo('password')}
                    className={`w-full rounded-lg pl-10 pr-4 py-3 border transition-colors focus:outline-none focus:border-orange-500 ${
                      claro ? 'bg-white border-gray-300 text-gray-900 placeholder-gray-400' : 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                    }`}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-3.5 transition-all shadow-lg shadow-orange-500/25"
              >
                {loading ? 'Ingresando...' : (<>Ingresar <ArrowRight size={17} /></>)}
              </button>
            </form>
          </div>

          <p className={`text-center text-xs mt-6 ${claro ? 'text-gray-400' : 'text-gray-600'}`}>
            © {new Date().getFullYear()} PowerPOS Pioneers · Colombia
          </p>
        </div>
      </div>

      {tecladoVisible && (
        <TouchKeyboard
          titulo={campoActivo === 'email' ? 'Escribiendo: Email' : 'Escribiendo: Contraseña'}
          value={campoActivo === 'email' ? email : password}
          onChange={campoActivo === 'email' ? setEmail : setPassword}
          onClose={() => setTecladoVisible(false)}
        />
      )}
    </div>
  );
}
