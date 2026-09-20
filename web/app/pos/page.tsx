'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { ShoppingCart, Plus, Minus, Trash2, User, X, Search, Keyboard, LayoutGrid, ChevronDown } from 'lucide-react';
import AuthGuard from '@/components/AuthGuard';
import Navbar from '@/components/Navbar';
import TouchKeyboard from '@/components/TouchKeyboard';
import RetailPOS from './RetailPOS';

interface AdicionalProducto {
  id: number;
  nombre: string;
  precio: string;
}

interface Categoria {
  id: number;
  nombre: string;
  color: string;
  icono: string;
  parentId?: number | null;
  subcategorias?: Categoria[];
}

interface Producto {
  id: number;
  nombre: string;
  precio: string;
  descripcion: string;
  categoria: { id: number; nombre: string; color: string; icono: string; parentId?: number | null };
  ingredientes: { ingrediente: { nombre: string } }[];
  adicionales?: { adicional: AdicionalProducto }[];
  aceptaAdicionales?: boolean;
}

interface AdicionalSeleccionado {
  adicionalId: number;
  nombre: string;
  precio: number;
  cantidad: number;
}

interface ItemCarrito {
  producto: Producto;
  cantidad: number;
  exclusiones: string[];
  adicionales: AdicionalSeleccionado[];
  observacion: string;
}

function RestaurantePOS() {
  const { usuario } = useAuthStore();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [adicionalesCatalogo, setAdicionalesCatalogo] = useState<AdicionalProducto[]>([]);
  const [modalProducto, setModalProducto] = useState<Producto | null>(null);
  const [exclusionesTemp, setExclusionesTemp] = useState<string[]>([]);
  const [adicionalesTemp, setAdicionalesTemp] = useState<AdicionalSeleccionado[]>([]);
  const [observacionTemp, setObservacionTemp] = useState('');
  const [cantidadTemp, setCantidadTemp] = useState(1);
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [loading, setLoading] = useState(false);
  const [pedidoExitoso, setPedidoExitoso] = useState<string | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' });
  const [logoEmpresa, setLogoEmpresa] = useState<string | null>(null);
  const [nombreEmpresa, setNombreEmpresa] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [logoBase64, setLogoBase64] = useState<string>('');
  const [cajaAbierta, setCajaAbierta] = useState<any>(null);
  const [modoPreparacion, setModoPreparacion] = useState<'KDS' | 'COMANDAS'>(usuario?.modoPreparacion || 'KDS');
  const [imprimirComanda, setImprimirComanda] = useState(true);
  const [ultimoPedido, setUltimoPedido] = useState<string | null>(null);
  const canalPantalla = useRef<BroadcastChannel | null>(null);

  // Cliente asociado al pedido
  const [clienteSeleccionado, setClienteSeleccionado] = useState<any>(null);
  const [reglasPuntos, setReglasPuntos] = useState<{habilitado:boolean;compraPorPunto:number;valorPunto:number;categoriasExcluidas:number[];productosExcluidos:number[]}|null>(null);
  const [puntosCanjeados, setPuntosCanjeados] = useState(0);
  useEffect(() => { if (!usuario) return; api.get('/tienda-admin/configuracion').then(r=>setReglasPuntos(r.data.fidelizacion)).catch(()=>setReglasPuntos(null)); }, [usuario]);
  useEffect(() => { setPuntosCanjeados(0); }, [clienteSeleccionado?.id]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [tecladoClienteVisible, setTecladoClienteVisible] = useState(false);
  const [tecladoObservacionVisible, setTecladoObservacionVisible] = useState(false);
  const [resultadosCliente, setResultadosCliente] = useState<any[]>([]);
  const [mostrarDropdownCliente, setMostrarDropdownCliente] = useState(false);

  const extrasPorUnidad = (item: ItemCarrito) =>
    item.adicionales.reduce((acc, a) => acc + a.precio * a.cantidad, 0);
  const precioLinea = (item: ItemCarrito) =>
    (Number(item.producto.precio) + extrasPorUnidad(item)) * item.cantidad;

  // Adicionales a mostrar para el producto abierto:
  //  - si el producto tiene adicionales marcados, se muestran esos (aunque no acepte el catálogo general);
  //  - si no tiene marcados y "acepta adicionales", se ofrece todo el catálogo de la empresa;
  //  - si no acepta adicionales (ej. bebidas), no se muestra nada.
  const adicionalesDelModal: AdicionalProducto[] = !modalProducto
    ? []
    : modalProducto.adicionales && modalProducto.adicionales.length > 0
      ? modalProducto.adicionales.map((a) => a.adicional)
      : modalProducto.aceptaAdicionales === false
        ? []
        : adicionalesCatalogo;

  const subtotalPuntos = carrito.reduce((acc, item) => acc + precioLinea(item), 0);
  const canjeAplicado = reglasPuntos?.habilitado && clienteSeleccionado ? Math.min(puntosCanjeados, clienteSeleccionado.puntos, Math.floor(subtotalPuntos / (reglasPuntos.valorPunto || Infinity))) : 0;
  const descuentoPuntos = Math.round(canjeAplicado * (reglasPuntos?.valorPunto || 0) * 100) / 100;
  const total = subtotalPuntos - descuentoPuntos;
  const elegiblePuntos = reglasPuntos ? carrito.filter(i=>!reglasPuntos.productosExcluidos.includes(i.producto.id)&&!reglasPuntos.categoriasExcluidas.includes(i.producto.categoria.id)).reduce((s,i)=>s+precioLinea(i),0) : 0;
  const puntosEstimados = reglasPuntos?.habilitado && reglasPuntos.compraPorPunto>0 && subtotalPuntos>0 ? Math.floor(elegiblePuntos * (1-descuentoPuntos/subtotalPuntos)/reglasPuntos.compraPorPunto) : 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    cargarDatos();
    const cargarCaja = async () => {
      try {
        const { data } = await api.get('/caja/abierta');
        setCajaAbierta(data);
      } catch {
        setCajaAbierta(null);
      }
    };
    void cargarCaja();
  }, [mounted]);

  const esSupervisor = usuario?.rol === 'ADMIN_EMPRESA' || usuario?.rol === 'GERENTE';
  const cajaBloqueadaPorUsuario = !!cajaAbierta && !!usuario && Number(cajaAbierta.usuarioId) !== Number(usuario.id) && !esSupervisor;

  useEffect(() => {
    if (!mounted) return;
    canalPantalla.current = new BroadcastChannel('powerpos-pantalla-cliente');
    return () => {
      canalPantalla.current?.close();
    };
  }, [mounted]);

  useEffect(() => {
    canalPantalla.current?.postMessage({
      empresa: nombreEmpresa || 'PowerPOS',
      logoUrl: logoEmpresa,
      items: carrito.map((item) => ({
        nombre: item.producto.nombre,
        cantidad: item.cantidad,
        precio: Number(item.producto.precio) + extrasPorUnidad(item),
        adicionales: item.adicionales.map((a) => ({ nombre: a.nombre, cantidad: a.cantidad })),
      })),
      total,
      pedido: ultimoPedido,
      clienteNombre: clienteSeleccionado?.nombre || null,
      mensajeLlamado: clienteSeleccionado?.nombre ? `Pedido listo para ${clienteSeleccionado.nombre}` : null,
    });
  }, [carrito, nombreEmpresa, logoEmpresa, total, ultimoPedido, clienteSeleccionado]);

  useEffect(() => {
    if (!busquedaCliente) {
      setResultadosCliente([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const { data } = await api.get(`/clientes?busqueda=${busquedaCliente}`);
        setResultadosCliente(data);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [busquedaCliente]);

  const cargarLogoBase64DesdeUrl = async (logoUrl: string): Promise<string> => {
    if (!logoUrl) return '';
    if (logoBase64) return logoBase64;

    try {
      const respuesta = await fetch(logoUrl);
      const blob = await respuesta.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('No se pudo leer el logo'));
        reader.readAsDataURL(blob);
      });
      setLogoBase64(base64);
      return base64;
    } catch (e) {
      console.error('Error logo:', e);
      return '';
    }
  };

  const cargarDatos = async () => {
    const [catsResult, prodsResult, empresaResult, adicionalesResult] = await Promise.allSettled([
      api.get('/categorias'),
      api.get('/productos'),
      api.get('/empresa'),
      api.get('/adicionales'),
    ]);

    if (catsResult.status === 'fulfilled') setCategorias(catsResult.value.data);
    if (prodsResult.status === 'fulfilled') setProductos(prodsResult.value.data);
    if (adicionalesResult.status === 'fulfilled') setAdicionalesCatalogo(adicionalesResult.value.data);

    if (empresaResult.status === 'fulfilled') {
      const empresa = empresaResult.value.data;
      setNombreEmpresa(empresa.nombre || 'PowerPOS');
      if (empresa.modoPreparacion) setModoPreparacion(empresa.modoPreparacion);

      if (empresa.logo) {
        setLogoEmpresa(empresa.logo);
        void cargarLogoBase64DesdeUrl(empresa.logo);
      }
    }
  };

  const seleccionarCliente = (cliente: any) => {
    setClienteSeleccionado(cliente);
    setBusquedaCliente('');
    setResultadosCliente([]);
    setMostrarDropdownCliente(false);
    setTecladoClienteVisible(false);
  };

  const quitarCliente = () => {
    setClienteSeleccionado(null);
  };

  const imprimirTicket = async (pedido: any) => {
    const logoFinal = logoBase64 || (logoEmpresa ? await cargarLogoBase64DesdeUrl(logoEmpresa) : '');
    const ventana = window.open('', '_blank', 'width=320,height=700');
    if (!ventana) return;

    const logoHtml = logoFinal
      ? `<img src="${logoFinal}" style="width:70px;height:70px;border-radius:16px;object-fit:cover;margin:0 auto 8px;display:block;" />`
      : `<div class="logo-placeholder">🍔</div>`;

    const contenido = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Ticket ${pedido.numero}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Inter', 'Courier New', monospace;
            font-size: 12px;
            width: 300px;
            margin: 0 auto;
            padding: 16px 12px;
            background: white;
            color: #111;
          }
          .header {
            text-align: center;
            padding-bottom: 12px;
            border-bottom: 2px dashed #ddd;
            margin-bottom: 12px;
          }
          .logo-placeholder {
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, #FF6B35, #f7931e);
            border-radius: 16px;
            margin: 0 auto 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
          }
          .empresa-nombre {
            font-size: 18px;
            font-weight: 900;
            letter-spacing: -0.5px;
            color: #111;
          }
          .empresa-subtitulo {
            font-size: 10px;
            color: #888;
            margin-top: 2px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .numero-pedido {
            background: #111;
            color: white;
            border-radius: 8px;
            padding: 8px 12px;
            margin: 12px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .numero-pedido .label {
            font-size: 10px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .numero-pedido .valor {
            font-size: 14px;
            font-weight: 700;
            color: #FF6B35;
          }
          .fecha {
            text-align: center;
            font-size: 10px;
            color: #888;
            margin-bottom: 12px;
          }
          .seccion-titulo {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #888;
            margin-bottom: 8px;
          }
          .producto {
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid #f0f0f0;
          }
          .producto:last-child { border-bottom: none; }
          .producto-fila {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .producto-nombre {
            font-weight: 700;
            font-size: 13px;
            flex: 1;
          }
          .producto-cantidad {
            background: #FF6B35;
            color: white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            margin-right: 6px;
            flex-shrink: 0;
          }
          .producto-precio {
            font-weight: 700;
            color: #111;
            white-space: nowrap;
          }
          .exclusion {
            display: inline-block;
            background: #fff0f0;
            border: 1px solid #ffcccc;
            color: #cc0000;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            margin: 4px 2px 0 26px;
          }
          .adicion {
            display: inline-block;
            background: #f0fff4;
            border: 1px solid #b2f5c8;
            color: #276749;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            margin: 4px 2px 0 26px;
          }
          .observacion-item {
            display: block;
            color: #f7931e;
            font-size: 10px;
            margin: 3px 0 0 26px;
          }
          .separador {
            border: none;
            border-top: 2px dashed #ddd;
            margin: 12px 0;
          }
          .totales {
            background: #f9f9f9;
            border-radius: 8px;
            padding: 10px 12px;
          }
          .total-fila {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 12px;
            color: #555;
          }
          .total-final {
            display: flex;
            justify-content: space-between;
            font-size: 16px;
            font-weight: 900;
            color: #111;
            padding-top: 8px;
            margin-top: 4px;
            border-top: 1px solid #ddd;
          }
          .total-final span:last-child { color: #FF6B35; }
          .metodo-pago {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin-top: 10px;
            background: #f0fff4;
            border: 1px solid #b2f5c8;
            border-radius: 8px;
            padding: 6px 12px;
            font-size: 11px;
            font-weight: 600;
            color: #276749;
          }
          .observacion-pedido {
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-radius: 8px;
            padding: 8px 12px;
            margin-top: 10px;
            font-size: 11px;
            color: #92400e;
          }
          .footer {
            text-align: center;
            margin-top: 16px;
            padding-top: 12px;
            border-top: 2px dashed #ddd;
          }
          .footer-gracias {
            font-size: 14px;
            font-weight: 700;
            color: #111;
            margin-bottom: 4px;
          }
          .footer-sub { font-size: 10px; color: #aaa; }
          .powered {
            margin-top: 8px;
            font-size: 9px;
            color: #ccc;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          @media print {
            body { width: 80mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoHtml}
          <div class="empresa-nombre">${nombreEmpresa.toUpperCase()}</div>
          <div class="empresa-subtitulo">Sistema de gestión gastronómica</div>
        </div>

        <div class="numero-pedido">
          <div>
            <div class="label">Pedido</div>
            <div class="valor">${pedido.numero}</div>
          </div>
          <div style="text-align:right">
            <div class="label">Estado</div>
            <div style="color:white;font-weight:700;font-size:12px">PENDIENTE</div>
          </div>
        </div>

        <div class="fecha">${new Date().toLocaleString('es-CO', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</div>

        <div class="seccion-titulo">Productos del pedido</div>

        ${pedido.detalles.map((d: any) => `
          <div class="producto">
            <div class="producto-fila">
              <span class="producto-cantidad">${d.cantidad}</span>
              <span class="producto-nombre">${d.producto.nombre}</span>
              <span class="producto-precio">$${Number(d.subtotal).toLocaleString()}</span>
            </div>
            ${d.exclusiones && d.exclusiones.length > 0 ? d.exclusiones.map((exc: string) => `
              <span class="exclusion">✕ SIN ${exc.toUpperCase()}</span>
            `).join('') : ''}
            ${d.adicionales && d.adicionales.length > 0 ? d.adicionales.map((ad: any) => `
              <span class="adicion">ADIC: ${ad.nombre.toUpperCase()}${ad.cantidad > 1 ? ` x${ad.cantidad}` : ''} ($${Number(ad.precio).toLocaleString()})</span>
            `).join('') : ''}
            ${d.observacion ? `<span class="observacion-item">📝 ${d.observacion}</span>` : ''}
          </div>
        `).join('')}

        <hr class="separador">

        <div class="totales">
          <div class="total-fila">
            <span>Subtotal</span>
            <span>$${Number(pedido.subtotal).toLocaleString()}</span>
          </div>
          ${Number(pedido.descuento) > 0 ? `
          <div class="total-fila">
            <span>Descuento</span>
            <span style="color:#cc0000">-$${Number(pedido.descuento).toLocaleString()}</span>
          </div>` : ''}
          <div class="total-final">
            <span>TOTAL</span>
            <span>$${Number(pedido.total).toLocaleString()}</span>
          </div>
        </div>

        <div class="metodo-pago">✓ Pago en ${pedido.metodoPago}</div>

        ${pedido.cliente ? `
          <div class="observacion-pedido">
            👤 <strong>Cliente:</strong> ${pedido.cliente.nombre}${pedido.cliente.telefono ? ` · ${pedido.cliente.telefono}` : ''}
          </div>
        ` : ''}

        ${pedido.observacion ? `
          <div class="observacion-pedido">
            📝 <strong>Nota:</strong> ${pedido.observacion}
          </div>
        ` : ''}

        <div class="footer">
          <div class="footer-gracias">¡Gracias por su compra!</div>
          <div class="footer-sub">Esperamos verle pronto</div>
          <div class="powered">Powered by PowerPOS Pioneers</div>
        </div>
      </body>
      </html>
    `;

    ventana.document.write(contenido);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => {
      ventana.print();
      ventana.close();
    }, 800);
  };

  const imprimirComandaFallback = (pedido: any) => {
    const ventana = window.open('', '_blank', 'width=320,height=700');
    if (!ventana) return;

    const logoComanda = logoBase64
      ? `<img src="${logoBase64}" class="logo" />`
      : `<div class="logo-placeholder">🍔</div>`;
    const etiquetaLado = pedido?.ladoNombre ? ` · ${pedido.ladoNombre}` : '';

    const contenido = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Comanda ${pedido.numero}${etiquetaLado}</title>
        <style>
          * { box-sizing: border-box; }
          body { width: 300px; margin: 0 auto; padding: 14px 12px; font-family: 'Inter', 'Courier New', monospace; color: #111; background: #fff; font-size: 13px; }
          .encabezado { text-align: center; border-bottom: 2px dashed #d1d5db; padding-bottom: 12px; margin-bottom: 12px; }
          .logo { width: 52px; height: 52px; object-fit: cover; border-radius: 12px; margin: 0 auto 6px; display: block; }
          .logo-placeholder { width: 52px; height: 52px; border-radius: 12px; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #ff6b35, #f7931e); font-size: 24px; }
          .empresa { font-size: 16px; font-weight: 900; letter-spacing: .3px; }
          .subtitulo { color: #6b7280; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 3px; }
          .barra-pedido { background: #111827; color: #fff; border-radius: 8px; padding: 9px 11px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
          .etiqueta { color: #9ca3af; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
          .numero { color: #ff8a50; font-size: 17px; font-weight: 900; margin-top: 2px; }
          .estado { color: #d1fae5; font-size: 10px; font-weight: 700; text-transform: uppercase; }
          .fecha { text-align: center; color: #6b7280; font-size: 10px; margin-bottom: 13px; }
          .titulo-seccion { color: #6b7280; font-size: 9px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 5px; }
          .producto { border-bottom: 1px solid #e5e7eb; padding: 9px 0; }
          .fila { display: flex; gap: 8px; align-items: flex-start; }
          .cantidad { background: #ff6b35; color: #fff; border-radius: 5px; min-width: 29px; padding: 4px 3px; text-align: center; font-size: 15px; font-weight: 900; }
          .nombre { font-size: 15px; font-weight: 800; line-height: 1.2; flex: 1; padding-top: 3px; }
          .detalle { margin: 6px 0 0 37px; font-size: 11px; font-weight: 800; line-height: 1.3; }
          .sin { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 3px 5px; }
          .con { color: #276749; background: #f0fff4; border: 1px solid #b2f5c8; border-radius: 4px; padding: 3px 5px; }
          .nota { color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 3px 5px; }
          .general { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; margin-top: 12px; padding: 8px; color: #92400e; font-size: 11px; font-weight: 800; line-height: 1.3; }
          .pie { border-top: 2px dashed #d1d5db; text-align: center; color: #9ca3af; font-size: 9px; margin-top: 14px; padding-top: 10px; }
          @media print { body { width: 80mm; } }
        </style>
      </head>
      <body>
        <div class="encabezado">
          ${logoComanda}
          <div class="empresa">${nombreEmpresa.toUpperCase()}</div>
          <div class="subtitulo">Comanda de preparación${etiquetaLado}</div>
        </div>
        <div class="barra-pedido">
          <div><div class="etiqueta">Pedido</div><div class="numero">${pedido.numero}</div></div>
          <div class="estado">${pedido?.ladoNombre || 'Pendiente'}</div>
        </div>
        <div class="fecha">
          ${new Date().toLocaleString('es-CO', {
            weekday: 'short', day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit'
          })}
        </div>
        <div class="titulo-seccion">Productos</div>
        ${pedido.detalles.map((detalle: any) => `
          <div class="producto">
            <div class="fila">
              <span class="cantidad">${detalle.cantidad}x</span>
              <span class="nombre">${detalle.producto.nombre}</span>
            </div>
            ${detalle.exclusiones?.length ? `<div class="detalle sin">SIN: ${detalle.exclusiones.join(', ').toUpperCase()}</div>` : ''}
            ${detalle.adicionales?.length ? `<div class="detalle con">ADIC: ${detalle.adicionales.map((a: any) => `${a.nombre}${a.cantidad > 1 ? ` x${a.cantidad}` : ''}`).join(', ').toUpperCase()}</div>` : ''}
            ${detalle.observacion ? `<div class="detalle nota">NOTA: ${detalle.observacion}</div>` : ''}
          </div>
        `).join('')}
        ${pedido.cliente ? `<div class="general">CLIENTE: ${pedido.cliente.nombre.toUpperCase()}${pedido.cliente.telefono ? ` · ${pedido.cliente.telefono}` : ''}</div>` : ''}
        ${pedido.observacion ? `<div class="general">NOTA GENERAL: ${pedido.observacion}</div>` : ''}
        <div class="pie">Preparar y entregar en mostrador</div>
      </body>
      </html>
    `;

    ventana.document.write(contenido);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => {
      ventana.print();
      ventana.close();
    }, 500);
  };

  const categoriasPrincipales = categorias.filter((cat) => !cat.parentId);
  const categoriaSeleccionada = categorias.find((cat) => cat.id === categoriaActiva) || null;
  const categoriaTopActiva = categoriaSeleccionada
    ? categoriaSeleccionada.parentId
      ? categoriasPrincipales.find((cat) => cat.id === categoriaSeleccionada.parentId) || null
      : categoriaSeleccionada
    : null;
  const subcategoriasActivas = categoriaTopActiva?.subcategorias || [];

  const productosFiltrados = (() => {
    if (!categoriaActiva || !categoriaSeleccionada) return productos;
    if (categoriaSeleccionada.parentId) {
      return productos.filter((p) => p.categoria?.id === categoriaActiva);
    }
    return productos.filter(
      (p) => p.categoria?.id === categoriaActiva || p.categoria?.parentId === categoriaActiva,
    );
  })();

  const abrirModal = (producto: Producto) => {
    setModalProducto(producto);
    setExclusionesTemp([]);
    setAdicionalesTemp([]);
    setObservacionTemp('');
    setCantidadTemp(1);
    setTecladoObservacionVisible(false);
  };

  const toggleExclusion = (nombre: string) => {
    setExclusionesTemp((prev) =>
      prev.includes(nombre) ? prev.filter((e) => e !== nombre) : [...prev, nombre]
    );
  };

  const toggleAdicional = (adicional: AdicionalProducto) => {
    setAdicionalesTemp((prev) =>
      prev.some((a) => a.adicionalId === adicional.id)
        ? prev.filter((a) => a.adicionalId !== adicional.id)
        : [...prev, { adicionalId: adicional.id, nombre: adicional.nombre, precio: Number(adicional.precio), cantidad: 1 }]
    );
  };

  const cambiarCantidadAdicional = (adicionalId: number, delta: number) => {
    setAdicionalesTemp((prev) =>
      prev
        .map((a) => (a.adicionalId === adicionalId ? { ...a, cantidad: a.cantidad + delta } : a))
        .filter((a) => a.cantidad > 0)
    );
  };

  const agregarAlCarrito = () => {
    if (!modalProducto) return;
    const cantidad = Math.max(1, Number(cantidadTemp) || 1);
    const claveAdicionales = JSON.stringify(
      [...adicionalesTemp].sort((a, b) => a.adicionalId - b.adicionalId)
    );
    setCarrito((prev) => {
      const existe = prev.findIndex(
        (i) =>
          i.producto.id === modalProducto.id &&
          JSON.stringify(i.exclusiones) === JSON.stringify(exclusionesTemp) &&
          JSON.stringify([...i.adicionales].sort((a, b) => a.adicionalId - b.adicionalId)) === claveAdicionales &&
          i.observacion === observacionTemp
      );
      if (existe >= 0) {
        const nuevo = [...prev];
        nuevo[existe].cantidad += cantidad;
        return nuevo;
      }
      return [...prev, { producto: modalProducto, cantidad, exclusiones: exclusionesTemp, adicionales: adicionalesTemp, observacion: observacionTemp }];
    });
    setModalProducto(null);
    setTecladoObservacionVisible(false);
    setCantidadTemp(1);
  };

  const cambiarCantidad = (index: number, delta: number) => {
    setCarrito((prev) => {
      const nuevo = [...prev];
      nuevo[index].cantidad += delta;
      if (nuevo[index].cantidad <= 0) nuevo.splice(index, 1);
      return nuevo;
    });
  };

  const requierePreparacion = (producto: Producto) => {
    const categoria = String(producto?.categoria?.nombre || '').toLowerCase();
    if (categoria.includes('bebida')) return true;
    return producto?.aceptaAdicionales !== false;
  };

  const obtenerLadoComanda = (detalle: any) => {
    const nombreCategoria = String(detalle?.producto?.categoria?.nombre || '').toLowerCase();
    if (nombreCategoria.includes('lado 1') || nombreCategoria.includes('lado1')) return 'LADO 1';
    if (nombreCategoria.includes('lado 2') || nombreCategoria.includes('lado2')) return 'LADO 2';
    return 'LADO 1';
  };

  const prepararPedidoComanda = (pedido: any) => {
    const grupos = new Map<string, any[]>();

    for (const detalle of pedido?.detalles || []) {
      const nombreCategoria = String(detalle?.producto?.categoria?.nombre || '').toLowerCase();
      const esBebida = nombreCategoria.includes('bebida');
      const sinPreparacion = detalle?.producto?.aceptaAdicionales === false;

      if (!esBebida && sinPreparacion) continue;

      const lado = obtenerLadoComanda(detalle);
      const grupoActual = grupos.get(lado) || [];
      grupoActual.push(detalle);
      grupos.set(lado, grupoActual);
    }

    if (grupos.size === 0) return [];

    return Array.from(grupos.entries()).map(([lado, detalles]) => ({
      ...pedido,
      ladoNombre: lado,
      detalles,
    }));
  };

  const confirmarPedido = async () => {
    if (!cajaAbierta) {
      setAlertDialog({
        open: true,
        title: 'Caja cerrada',
        message: 'No se puede vender hasta que el administrador abra la caja del día. Solicita la apertura antes de registrar pedidos.',
      });
      return;
    }
    if (cajaBloqueadaPorUsuario) {
      setAlertDialog({
        open: true,
        title: 'Caja asignada a otro cajero',
        message: `La caja abierta pertenece a ${cajaAbierta?.usuario?.nombre || 'otro cajero'}. Solo ese usuario o un administrador puede registrar ventas en esta caja.`,
      });
      return;
    }
    if (carrito.length === 0) return;
    setLoading(true);
    try {
      const { data } = await api.post('/pedidos', {
        sucursalId: usuario?.sucursalId || 1,
        metodoPago,
        clienteId: clienteSeleccionado?.id || null,
        puntosCanjeados: canjeAplicado,
        items: carrito.map((item) => ({
          productoId: item.producto.id,
          cantidad: item.cantidad,
          exclusiones: item.exclusiones,
          adicionales: item.adicionales.map((a) => ({ adicionalId: a.adicionalId, cantidad: a.cantidad })),
          observacion: item.observacion,
        })),
      });
      setPedidoExitoso(data.numero);
      setUltimoPedido(data.numero);
      setCarrito([]);
      setPuntosCanjeados(0);
      if (clienteSeleccionado) setClienteSeleccionado((c:any)=>c ? {...c,puntos:c.puntos-(data.puntosCanjeados||0)+(data.puntosGanados||0)} : c);

      const nombreCliente = data?.cliente?.nombre || clienteSeleccionado?.nombre || null;
      canalPantalla.current?.postMessage({
        empresa: nombreEmpresa || 'PowerPOS',
        logoUrl: logoEmpresa,
        items: [],
        total: 0,
        pedido: data.numero,
        clienteNombre: nombreCliente,
        mensajeLlamado: null,
      });

      setClienteSeleccionado(null);

      const comandasPedido = prepararPedidoComanda(data);
      const hayComanda = comandasPedido.length > 0;

      if (modoPreparacion === 'COMANDAS' && hayComanda && imprimirComanda) {
        for (const comandaPedido of comandasPedido) {
          try {
            const impresion = await api.post('/impresion/comanda', comandaPedido);
            if (!impresion.data.impreso) imprimirComandaFallback(comandaPedido);
          } catch {
            imprimirComandaFallback(comandaPedido);
          }
        }
      }
      if (metodoPago === 'EFECTIVO') {
        api.post('/impresion/abrir-cajon').catch(() => undefined);
      }

      try {
        const respuestaTicket = await api.post('/impresion/ticket', data);
        if (!respuestaTicket.data.impreso && respuestaTicket.data.fallbackBrowser) {
          await imprimirTicket(data);
        }
      } catch {
        await imprimirTicket(data);
      }

      setTimeout(() => setPedidoExitoso(null), 4000);
    } catch (e) {
      setAlertDialog({
        open: true,
        title: 'No se pudo registrar el pedido',
        message: 'Hubo un problema al guardar la venta. Revisa la información e intenta nuevamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-950 flex flex-col">
        <Navbar />

        {usuario?.rol === 'CAJERO' && (
          <div className="bg-orange-500/10 border-b border-orange-500/20 text-orange-300 px-4 py-2 text-center text-sm font-semibold">
            Modo caja · {usuario.sucursalId ? `Sucursal ${usuario.sucursalId}` : 'Sucursal principal'}
          </div>
        )}

        {pedidoExitoso && (
          <div className="bg-green-500/10 border-b border-green-500/20 text-green-400 text-center py-3 text-sm font-medium">
            ✓ Pedido {pedidoExitoso} registrado exitosamente
          </div>
        )}

        {alertDialog.open && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]">
            <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-gray-900 p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-400">
                  <X size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white">{alertDialog.title}</h3>
                  <p className="mt-2 text-sm text-gray-300 leading-relaxed">{alertDialog.message}</p>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setAlertDialog({ open: false, title: '', message: '' })}
                  className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}

        {!cajaAbierta && (
          <div className="border-b border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 text-center text-sm font-medium">
            La caja de la sucursal está cerrada. Solo el administrador puede abrirla para poder vender.
          </div>
        )}

        {cajaBloqueadaPorUsuario && (
          <div className="border-b border-red-500/30 bg-red-500/10 text-red-200 px-4 py-3 text-center text-sm font-medium">
            La caja abierta está asignada al cajero {cajaAbierta?.usuario?.nombre || 'seleccionado'}. Este usuario no puede registrar ventas.
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className={`flex-1 flex flex-col overflow-hidden ${(!cajaAbierta || cajaBloqueadaPorUsuario) ? 'pointer-events-none opacity-50' : ''}`}>
            <div className="border-b border-gray-800 bg-gray-950">
              <div className="flex flex-wrap gap-2 p-3">
                <button
                  onClick={() => setCategoriaActiva(null)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    !categoriaActiva
                      ? 'bg-gradient-to-b from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/25'
                      : 'bg-gray-900 border border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
                  }`}
                >
                  <LayoutGrid size={14} />
                  Todos
                </button>
                {categoriasPrincipales.map((cat) => {
                  const activa = categoriaTopActiva?.id === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategoriaActiva(cat.id)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                        activa
                          ? 'bg-gradient-to-b from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/25'
                          : 'bg-gray-900 border border-gray-800 text-gray-400 hover:border-gray-700 hover:text-white'
                      }`}
                    >
                      <span>{cat.icono}</span>
                      {cat.nombre}
                      {(cat.subcategorias?.length ?? 0) > 0 && (
                        <ChevronDown size={13} className={`transition-transform ${activa ? 'rotate-180' : ''}`} />
                      )}
                    </button>
                  );
                })}
              </div>

              {subcategoriasActivas.length > 0 && (
                <div className="flex flex-wrap gap-2 px-3 pb-3 -mt-1">
                  <button
                    onClick={() => categoriaTopActiva && setCategoriaActiva(categoriaTopActiva.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                      categoriaActiva === categoriaTopActiva?.id
                        ? 'bg-cyan-500 text-gray-950'
                        : 'bg-gray-900 border border-cyan-500/30 text-cyan-300 hover:border-cyan-500/60'
                    }`}
                  >
                    Todas
                  </button>
                  {subcategoriasActivas.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setCategoriaActiva(sub.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        categoriaActiva === sub.id
                          ? 'bg-cyan-500 text-gray-950'
                          : 'bg-gray-900 border border-cyan-500/30 text-cyan-300 hover:border-cyan-500/60'
                      }`}
                    >
                      ↳ {sub.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
              {productosFiltrados.length === 0 && (
                <div className="col-span-full text-center text-gray-600 text-sm py-16">
                  {productos.length === 0 ? 'Aún no hay productos registrados.' : 'No hay productos en esta categoría.'}
                </div>
              )}
              {productosFiltrados.map((producto) => (
                <button
                  key={producto.id}
                  onClick={() => abrirModal(producto)}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left hover:border-orange-500/50 hover:bg-gray-800 transition-all"
                >
                  <div className="text-2xl mb-2">{producto.categoria?.icono || '🍽️'}</div>
                  <div className="text-white font-medium text-sm mb-1">{producto.nombre}</div>
                  <div className="text-orange-500 font-bold">${Number(producto.precio).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-800 flex items-center gap-2">
              <ShoppingCart size={18} className="text-orange-500" />
              <span className="text-white font-semibold">Pedido actual</span>
              <span className="ml-auto bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{carrito.length}</span>
            </div>

            {/* Selector de cliente */}
            <div className="p-4 border-b border-gray-800">
              {clienteSeleccionado ? (
                <div className="flex items-center justify-between bg-gray-800 border border-orange-500/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <User size={14} className="text-orange-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-white text-sm font-medium truncate">{clienteSeleccionado.nombre}</div>
                      <div className="text-yellow-400 text-xs">⭐ {clienteSeleccionado.puntos} puntos</div>
                    </div>
                  </div>
                  <button onClick={quitarCliente} className="text-gray-500 hover:text-white transition-colors flex-shrink-0">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={busquedaCliente}
                    onChange={(e) => { setBusquedaCliente(e.target.value); setMostrarDropdownCliente(true); }}
                    onFocus={() => setMostrarDropdownCliente(true)}
                    placeholder="Buscar cliente (opcional)..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-9 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => { setMostrarDropdownCliente(true); setTecladoClienteVisible((prev) => !prev); }}
                    title="Teclado en pantalla"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${tecladoClienteVisible ? 'text-orange-500' : 'text-gray-500 hover:text-white'}`}
                  >
                    <Keyboard size={15} />
                  </button>
                  {mostrarDropdownCliente && resultadosCliente.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden z-10 max-h-48 overflow-y-auto">
                      {resultadosCliente.map((cliente) => (
                        <button
                          key={cliente.id}
                          onClick={() => seleccionarCliente(cliente)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0"
                        >
                          <div className="text-white text-sm">{cliente.nombre}</div>
                          <div className="text-gray-500 text-xs">{cliente.telefono || cliente.documento || ''}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {carrito.length === 0 && (
                <p className="text-gray-600 text-sm text-center mt-8">Selecciona productos para agregar al pedido</p>
              )}
              {carrito.map((item, index) => (
                <div key={index} className="bg-gray-800 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-white text-sm font-medium">{item.producto.nombre}</div>
                      {item.exclusiones.length > 0 && (
                        <div className="text-red-400 text-xs mt-1">Sin: {item.exclusiones.join(', ')}</div>
                      )}
                      {item.adicionales.length > 0 && (
                        <div className="text-green-400 text-xs mt-1">
                          {item.adicionales.map((a) => (
                            <div key={a.adicionalId}>
                              + {a.nombre}{a.cantidad > 1 ? ` x${a.cantidad}` : ''} (${(a.precio * a.cantidad).toLocaleString()})
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-orange-500 text-sm font-bold mt-1">
                        ${precioLinea(item).toLocaleString()}
                      </div>
                    </div>
                    <button onClick={() => cambiarCantidad(index, -item.cantidad)} className="text-gray-600 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={() => cambiarCantidad(index, -1)} className="bg-gray-700 hover:bg-gray-600 text-white rounded w-6 h-6 flex items-center justify-center transition-colors">
                      <Minus size={12} />
                    </button>
                    <span className="text-white text-sm font-medium">{item.cantidad}</span>
                    <button onClick={() => cambiarCantidad(index, 1)} className="bg-gray-700 hover:bg-gray-600 text-white rounded w-6 h-6 flex items-center justify-center transition-colors">
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-gray-800 space-y-3">
              {clienteSeleccionado && reglasPuntos?.habilitado && subtotalPuntos > 0 && (
                <div className="text-center text-xs text-yellow-400">
                  Puntos estimados: +{puntosEstimados} para {clienteSeleccionado.nombre.split(' ')[0]}. El sistema confirma el cálculo al guardar.
                </div>
              )}
              {clienteSeleccionado && reglasPuntos?.habilitado && reglasPuntos.valorPunto>0 && <label className="block text-sm text-gray-300">Puntos a canjear · cada punto vale ${reglasPuntos.valorPunto.toLocaleString('es-CO')}<input type="number" min={0} max={Math.min(clienteSeleccionado.puntos,Math.floor(subtotalPuntos/reglasPuntos.valorPunto))} step={1} value={canjeAplicado} onChange={e=>setPuntosCanjeados(Math.max(0,Math.floor(Number(e.target.value)||0)))} className="mt-1 w-full rounded bg-gray-800 p-2"/><span className="text-xs">Descuento por puntos: ${descuentoPuntos.toLocaleString('es-CO')}</span></label>}
              <div className="flex justify-between text-white font-bold text-lg">
                <span>Total</span>
                <span className="text-orange-500">${total.toLocaleString()}</span>
              </div>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="NEQUI">Nequi</option>
                <option value="DAVIPLATA">Daviplata</option>
                <option value="TRANSFERENCIA">Transferencia</option>
              </select>
              <button
                onClick={confirmarPedido}
                disabled={carrito.length === 0 || loading || !cajaAbierta || cajaBloqueadaPorUsuario}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30 text-white font-bold rounded-lg py-3 transition-colors"
              >
                {loading ? 'Procesando...' : 'Confirmar pedido'}
              </button>
              <button
                onClick={() => window.open('/cliente', 'powerpos-pantalla-cliente', 'width=1280,height=800')}
                className="w-full border border-gray-700 hover:border-orange-500 text-gray-300 hover:text-white rounded-lg py-2 text-sm transition-colors"
              >
                Pantalla del cliente
              </button>
              <button
                onClick={() => window.open('/llamado', 'powerpos-pantalla-llamado', 'width=1600,height=900')}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg py-2 text-sm transition-colors"
              >
                Pantalla de llamado
              </button>
            </div>
          </div>
        </div>

        {modalProducto && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-800">
              <h3 className="text-white font-bold text-lg mb-1">{modalProducto.nombre}</h3>
              <p className="text-orange-500 font-bold mb-4">${Number(modalProducto.precio).toLocaleString()}</p>

              {modalProducto.ingredientes?.length > 0 && (
                <div className="mb-4">
                  <p className="text-gray-400 text-sm mb-2">¿Qué NO desea el cliente?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {modalProducto.ingredientes.map((ing) => (
                      <button
                        key={ing.ingrediente.nombre}
                        onClick={() => toggleExclusion(ing.ingrediente.nombre)}
                        className={`px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                          exclusionesTemp.includes(ing.ingrediente.nombre)
                            ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                            : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        {exclusionesTemp.includes(ing.ingrediente.nombre) ? '✕ ' : ''}
                        {ing.ingrediente.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {adicionalesDelModal.length > 0 && (
                <div className="mb-4">
                  <p className="text-gray-400 text-sm mb-2">¿Desea agregar adicionales?</p>
                  <div className="space-y-2">
                    {adicionalesDelModal.map((adicional) => {
                      const sel = adicionalesTemp.find((a) => a.adicionalId === adicional.id);
                      return (
                        <div
                          key={adicional.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            sel
                              ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                              : 'bg-gray-800 border border-gray-700 text-gray-300'
                          }`}
                        >
                          <button onClick={() => toggleAdicional(adicional)} className="flex-1 text-left">
                            {sel ? '✓ ' : '+ '}
                            {adicional.nombre}
                            <span className="text-gray-500"> · ${Number(adicional.precio).toLocaleString()}</span>
                          </button>
                          {sel && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => cambiarCantidadAdicional(adicional.id, -1)}
                                className="bg-gray-700 hover:bg-gray-600 text-white rounded w-5 h-5 flex items-center justify-center"
                              >
                                <Minus size={10} />
                              </button>
                              <span className="text-white text-xs w-4 text-center">{sel.cantidad}</span>
                              <button
                                onClick={() => cambiarCantidadAdicional(adicional.id, 1)}
                                className="bg-gray-700 hover:bg-gray-600 text-white rounded w-5 h-5 flex items-center justify-center"
                              >
                                <Plus size={10} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <p className="text-gray-400 text-sm mb-2">Cantidad</p>
                <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setCantidadTemp((prev) => Math.max(1, prev - 1))}
                    className="bg-gray-700 hover:bg-gray-600 text-white rounded w-8 h-8 flex items-center justify-center"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-white font-bold text-lg min-w-10 text-center">{cantidadTemp}</span>
                  <button
                    type="button"
                    onClick={() => setCantidadTemp((prev) => prev + 1)}
                    className="bg-gray-700 hover:bg-gray-600 text-white rounded w-8 h-8 flex items-center justify-center"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-gray-400 text-sm mb-2">Observación</p>
                <div className="relative">
                  <input
                    type="text"
                    value={observacionTemp}
                    onChange={(e) => setObservacionTemp(e.target.value)}
                    placeholder="Ej: término del punto, extra salsa..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 pr-9 text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setTecladoObservacionVisible((prev) => !prev)}
                    title="Teclado en pantalla"
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${tecladoObservacionVisible ? 'text-orange-500' : 'text-gray-500 hover:text-white'}`}
                  >
                    <Keyboard size={15} />
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setModalProducto(null); setTecladoObservacionVisible(false); }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg py-3 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={agregarAlCarrito}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg py-3 transition-colors"
                >
                  Agregar {cantidadTemp} · ${((
                    Number(modalProducto.precio) +
                    adicionalesTemp.reduce((acc, a) => acc + a.precio * a.cantidad, 0)
                  ) * cantidadTemp).toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        )}

        {tecladoClienteVisible && (
          <TouchKeyboard
            titulo="Buscar cliente"
            value={busquedaCliente}
            onChange={(v) => { setBusquedaCliente(v); setMostrarDropdownCliente(true); }}
            onClose={() => setTecladoClienteVisible(false)}
          />
        )}

        {tecladoObservacionVisible && (
          <TouchKeyboard
            titulo="Observación del producto"
            value={observacionTemp}
            onChange={setObservacionTemp}
            onClose={() => setTecladoObservacionVisible(false)}
          />
        )}
      </div>
    </AuthGuard>
  );
}

export default function POSPage() {
  const tipoNegocio = useAuthStore((state) => state.usuario?.tipoNegocio);
  return tipoNegocio && tipoNegocio !== 'RESTAURANTE' ? <RetailPOS /> : <RestaurantePOS />;
}
