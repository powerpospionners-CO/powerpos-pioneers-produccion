'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { ShoppingCart, LayoutDashboard, Package, Boxes, Users, DollarSign, BarChart3, Settings, LogOut, UtensilsCrossed, Moon, Sun, BookOpen } from 'lucide-react';
import { useTema } from '@/components/ThemeProvider';
import { irALoginGenerico } from '@/lib/navegacion';

const ITEMS = [
  { href: '/pos', label: 'POS', icon: ShoppingCart },
  { href: '/domicilios', label: 'Domicilios', icon: ShoppingCart },
  { href: '/mi-tienda', label: 'Mi tienda', icon: Settings },
  { href: '/catalogo', label: 'Catálogo', icon: BookOpen },
  { href: '/fidelizacion', label: 'Puntos', icon: Users },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/productos', label: 'Productos', icon: Package },
  { href: '/inventario', label: 'Inventario', icon: Boxes },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/financiero', label: 'Financiero', icon: DollarSign },
  { href: '/reportes', label: 'Reportes', icon: BarChart3 },
  { href: '/configuracion', label: 'Config', icon: Settings },
];

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { usuario, logout, setTipoNegocio } = useAuthStore();
  const { tema, cambiarTema } = useTema();
  const [pendientesWeb, setPendientesWeb] = useState(0);
  const [logoEmpresa, setLogoEmpresa] = useState<string | null>(null);
  useEffect(() => {
    if (!usuario?.empresaId) return;
    api.get('/empresa').then((respuesta) => {
      if (respuesta.data?.tipoNegocio && respuesta.data.tipoNegocio !== usuario.tipoNegocio) setTipoNegocio(respuesta.data.tipoNegocio);
      setLogoEmpresa(respuesta.data?.logo || null);
    }).catch(() => undefined);
  }, [usuario?.empresaId, usuario?.tipoNegocio, setTipoNegocio]);
  useEffect(() => {
    if (!['CAJERO','ADMIN_EMPRESA','GERENTE'].includes(usuario?.rol || '')) return;
    let activo = true;
    const cargar = () => api.get('/tienda-admin/resumen').then(r=>{if(activo)setPendientesWeb(r.data.pendientes);}).catch(()=>{});
    void cargar(); const timer = setInterval(cargar,5000);
    return () => { activo=false; clearInterval(timer); };
  },[usuario?.rol,usuario?.empresaId]);
  const esAdminOGerente = usuario?.rol === 'ADMIN_EMPRESA' || usuario?.rol === 'GERENTE';
  const esRestaurante = !usuario?.tipoNegocio || usuario.tipoNegocio === 'RESTAURANTE';
  const itemsVisibles = ITEMS.filter((item) => {
    if (item.href === '/catalogo') return usuario?.rol === 'ADMIN_EMPRESA' && !!usuario?.catalogoHabilitado;
    if (['/mi-tienda','/fidelizacion'].includes(item.href)) return usuario?.rol === 'ADMIN_EMPRESA';
    if (item.href === '/domicilios') return ['ADMIN_EMPRESA','GERENTE','CAJERO','DOMICILIARIO'].includes(usuario?.rol || '');
    if (usuario?.rol === 'DOMICILIARIO') return item.href === '/domicilios';
    if (usuario?.rol === 'CAJERO') return item.href === '/pos';
    if (esAdminOGerente) return true;
    return usuario?.permisos?.[item.href.replace('/', '')] !== false;
  });
  if (esRestaurante && esAdminOGerente && usuario?.consumoEmpleadosHabilitado) {
    itemsVisibles.push({ href: '/consumo-empleados', label: 'Consumo staff', icon: UtensilsCrossed });
  }

  const handleLogout = () => { logout(); irALoginGenerico(router); };

  return (
    <header className="bg-gray-900 border-b border-gray-800">
      <div className="flex items-center justify-between gap-3 min-w-0 px-3 md:px-6 py-3">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-shrink">
          <img src="/marca/logo-powerpos.png" alt="PowerPOS" className="w-7 h-7 md:w-8 md:h-8 object-contain flex-shrink-0" />
          <h1 className="text-lg md:text-xl font-bold text-white whitespace-nowrap hidden sm:block">Power<span className="text-orange-500">POS</span></h1>
          <span className="text-gray-600 hidden sm:inline">|</span>
          {logoEmpresa && (
            <img src={logoEmpresa} alt={usuario?.empresa || 'Empresa'} className="w-7 h-7 md:w-8 md:h-8 rounded-lg object-cover flex-shrink-0 bg-white/5 border border-gray-800" />
          )}
          <span className="text-gray-400 text-xs md:text-sm max-w-[160px] md:max-w-[240px] truncate block min-w-0">
            {usuario?.empresa || 'Empresa'}
          </span>
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <button type="button" onClick={cambiarTema} title={`Cambiar a tema ${tema === 'oscuro' ? 'claro' : 'oscuro'}`} aria-label={`Cambiar a tema ${tema === 'oscuro' ? 'claro' : 'oscuro'}`} className="rounded-lg border border-gray-700 p-2 text-gray-300 hover:text-orange-500">{tema === 'oscuro' ? <Sun size={17} /> : <Moon size={17} />}</button>
          <span className="text-gray-400 text-xs md:text-sm max-w-[120px] md:max-w-[180px] truncate hidden sm:block">
            {usuario?.nombre || 'Administrador'}
          </span>
          <button onClick={handleLogout} title="Cerrar sesión" className="text-gray-500 hover:text-white transition-colors flex-shrink-0">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-1.5 px-3 md:px-6 pb-3">
        {itemsVisibles.map((item) => {
          const activo = pathname === item.href;
          const Icon = item.icon;
          return (
            <button
              key={item.href}
              onClick={() => router.replace(item.href)}
              className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium whitespace-nowrap transition-colors ${
                activo
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                  : 'text-gray-400 border border-transparent hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon size={14} className="md:w-[15px] md:h-[15px] shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {pendientesWeb > 0 && (
        <div role="status" className="px-3 md:px-6 pb-3">
          <button onClick={() => router.replace('/domicilios')} className="block w-full text-left rounded-lg bg-teal-900 px-4 py-2 text-sm text-white hover:bg-teal-800 transition-colors">
            {pendientesWeb} pedido(s) web por revisar · Abrir Domicilios →
          </button>
        </div>
      )}
    </header>
  );
}
