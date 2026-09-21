'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { Keyboard, Moon, Sun } from 'lucide-react';
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

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const { tema, cambiarTema } = useTema();
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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Power<span className="text-orange-500">POS</span>
          </h1>
          <p className="text-gray-400">Pioneers — Sistema de punto de venta para tu negocio</p>
          <button type="button" onClick={cambiarTema} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300" aria-label={`Cambiar a tema ${tema === 'oscuro' ? 'claro' : 'oscuro'}`}>{tema === 'oscuro' ? <Sun size={16} /> : <Moon size={16} />}{tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro'}</button>
        </div>

        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Iniciar sesión</h2>
            <button
              type="button"
              onClick={() => setTecladoVisible((prev) => !prev)}
              title="Teclado en pantalla"
              className={`p-2 rounded-lg border transition-colors ${tecladoVisible ? 'bg-orange-500 border-orange-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
            >
              <Keyboard size={18} />
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setCampoActivo('email')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setCampoActivo('password')}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-semibold rounded-lg px-4 py-3 transition-colors"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
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
