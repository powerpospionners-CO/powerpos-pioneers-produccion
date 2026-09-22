"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import {
  ShoppingBag,
  Search,
  MapPin,
  Clock,
  Minus,
  Plus,
  CheckCircle2,
  AlertCircle,
  PackageSearch,
  Zap,
  Wallet,
  Radar,
  ArrowUp,
  Trash2,
} from "lucide-react";
import "./tienda.css";

function WhatsAppIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
    </svg>
  );
}

function FacebookIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" />
    </svg>
  );
}

function InstagramIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function TikTokIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82c-1.02-.88-1.66-2.18-1.66-3.62h-3.15v14.16c0 1.6-1.3 2.9-2.9 2.9a2.9 2.9 0 1 1 0-5.8c.27 0 .53.03.78.1v-3.2a6.1 6.1 0 0 0-.78-.05 6.06 6.06 0 1 0 6.06 6.06V9.4a7.87 7.87 0 0 0 4.6 1.47V7.72c-1 0-1.98-.32-2.75-.9-.08-.06-.15-.13-.2-.2v-1.8z" />
    </svg>
  );
}

const BASE_RED_SOCIAL: Record<string, string> = {
  facebook: "https://facebook.com/",
  instagram: "https://instagram.com/",
  tiktok: "https://tiktok.com/@",
};
function enlaceRedSocial(red: "facebook" | "instagram" | "tiktok", valor: string) {
  const limpio = (valor || "").trim();
  if (!limpio) return "";
  if (/^https?:\/\//i.test(limpio)) return limpio;
  return `${BASE_RED_SOCIAL[red]}${limpio.replace(/^@/, "")}`;
}

const BENEFICIOS = [
  { icon: Zap, titulo: "Pedidos en minutos", texto: "Arma tu pedido y envíalo directo a la empresa, sin filas ni llamadas." },
  { icon: Wallet, titulo: "Paga como prefieras", texto: "Efectivo, transferencia o pago digital al confirmar tu pedido." },
  { icon: Radar, titulo: "Sigue tu pedido", texto: "Consulta el estado de tu pedido en tiempo real desde esta misma página." },
  { icon: WhatsAppIcon, titulo: "Contacto directo", texto: "¿Dudas? Escríbenos por WhatsApp y te respondemos al instante." },
];

type Producto = {
  id: number;
  nombre: string;
  descripcion: string;
  precio: string;
  imagen: string;
  disponible: boolean;
  categoria: { nombre: string };
};
type Tienda = {
  nombre: string;
  logo: string;
  telefono: string;
  direccion: string;
  config: {
    titulo: string;
    descripcion: string;
    sobreNosotros: string;
    color: string;
    portada: string;
    whatsapp: string;
    horario: string;
    facebook: string;
    instagram: string;
    tiktok: string;
    pedidosHabilitados: boolean;
    minimo: number;
    zonas: { nombre: string; costo: number }[];
  };
  productos: Producto[];
};
const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const dinero = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
async function request(path: string, options?: RequestInit) {
  const r = await fetch(base + path, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  const d = await r.json();
  if (!r.ok)
    throw Error(
      Array.isArray(d.message)
        ? d.message.join(", ")
        : d.message || "No se pudo completar la solicitud",
    );
  return d;
}

export default function TiendaPage() {
  const { slug } = useParams<{ slug: string }>();
  const [tienda, setTienda] = useState<Tienda | null>(null),
    [error, setError] = useState(""),
    [cargando, setCargando] = useState(true);
  const [carrito, setCarrito] = useState<Record<number, number>>({}),
    [categoria, setCategoria] = useState("Todos"),
    [busqueda, setBusqueda] = useState("");
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    direccion: "",
    zona: "",
    observacion: "",
    metodoPago: "EFECTIVO",
  });
  const [enviando, setEnviando] = useState(false),
    [pedido, setPedido] = useState<{
      id: string;
      estado: string;
      total: number;
      motivo?: string;
    } | null>(null);
  const clave = useRef("");
  const [mostrarSubir, setMostrarSubir] = useState(false);
  useEffect(() => { if (tienda) document.title = `${tienda.nombre} · Tienda en línea`; }, [tienda]);
  useEffect(() => {
    const onScroll = () => setMostrarSubir(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const enviandoRef = useRef(false);
  const cargar = () =>
    request(`/tiendas/${encodeURIComponent(slug)}`)
      .then(setTienda)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  const actualizarSilencioso = () => {
    request(`/tiendas/${encodeURIComponent(slug)}`)
      .then(setTienda)
      .catch(() => {});
  };
  useEffect(() => {
    setTienda(null);
    setCarrito({});
    setPedido(null);
    setError("");
    setCargando(true);
    clave.current = "";
    void cargar();
  }, [slug]);
  useEffect(() => {
    const onFocus = () => actualizarSilencioso();
    const onVisibilidad = () => {
      if (document.visibilityState === "visible") actualizarSilencioso();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilidad);
    const timer = setInterval(actualizarSilencioso, 30000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilidad);
      clearInterval(timer);
    };
  }, [slug]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("pedido");
    if (id)
      request(
        `/tiendas/${encodeURIComponent(slug)}/pedidos/${encodeURIComponent(id)}`,
      )
        .then(setPedido)
        .catch(() =>
          setError("No fue posible recuperar el seguimiento del pedido."),
        );
  }, [slug]);
  useEffect(() => {
    if (!pedido?.id) return;
    const timer = setInterval(() => {
      request(`/tiendas/${encodeURIComponent(slug)}/pedidos/${pedido.id}`)
        .then(setPedido)
        .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [slug, pedido?.id]);
  const cambiar = (id: number, delta: number) => {
    if (enviandoRef.current) return;
    setCarrito((c) => ({
      ...c,
      [id]: Math.min(9999, Math.max(0, (c[id] || 0) + delta)),
    }));
    clave.current = "";
  };
  const escribirCantidad = (id: number, valor: string) => {
    if (enviandoRef.current) return;
    const numero = Math.floor(Number(valor.replace(/[^0-9]/g, "")));
    const limitado = Number.isFinite(numero) && numero > 0 ? Math.min(9999, numero) : 1;
    setCarrito((c) => ({ ...c, [id]: limitado }));
    clave.current = "";
  };
  const quitarDelCarrito = (id: number) => {
    if (enviandoRef.current) return;
    setCarrito((c) => {
      const nuevo = { ...c };
      delete nuevo[id];
      return nuevo;
    });
    clave.current = "";
  };
  const vaciarCarrito = () => {
    if (enviandoRef.current) return;
    setCarrito({});
    clave.current = "";
  };
  if (cargando)
    return (
      <main className="store">
        <div className="store-status">Estamos preparando el catálogo…</div>
      </main>
    );
  if (!tienda)
    return (
      <main className="store">
        <div className="store-status">
          <h1>Tienda no disponible</h1>
          <p>{error}</p>
          <button
            onClick={() => {
              setError("");
              setCargando(true);
              void cargar();
            }}
          >
            Volver a intentar
          </button>
        </div>
      </main>
    );
  const t = tienda.config,
    items = tienda.productos.filter((p) => carrito[p.id] > 0),
    subtotal = items.reduce((s, p) => s + Number(p.precio) * carrito[p.id], 0),
    zona = t.zonas.find((z) => z.nombre === form.zona),
    total = subtotal + (zona?.costo || 0);
  const cats = [
    "Todos",
    ...new Set(tienda.productos.map((p) => p.categoria.nombre)),
  ];
  const whatsapp = `https://wa.me/${t.whatsapp}?text=${encodeURIComponent(`Hola ${tienda.nombre}, quiero consultar este pedido:\n${items.map((p) => `${carrito[p.id]} × ${p.nombre}: ${dinero(Number(p.precio) * carrito[p.id])}`).join("\n")}\nProductos: ${dinero(subtotal)}\nEl domicilio y la disponibilidad quedan por confirmar.`)}`;
  const redesSociales = [
    { key: "facebook", url: enlaceRedSocial("facebook", t.facebook), Icon: FacebookIcon },
    { key: "instagram", url: enlaceRedSocial("instagram", t.instagram), Icon: InstagramIcon },
    { key: "tiktok", url: enlaceRedSocial("tiktok", t.tiktok), Icon: TikTokIcon },
  ].filter((r) => r.url);
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError("");
    if (!clave.current) clave.current = crypto.randomUUID();
    try {
      const d = await request(`/tiendas/${encodeURIComponent(slug)}/pedidos`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          clave: clave.current,
          totalEsperado: total,
          items: items.map((p) => ({
            productoId: p.id,
            cantidad: carrito[p.id],
          })),
        }),
      });
      setPedido(d);
      setCarrito({});
      clave.current = "";
      const url = new URL(window.location.href);
      url.searchParams.set("pedido", d.id);
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo enviar. Reintente; se conservará el identificador para evitar duplicados.",
      );
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }
  return (
    <main
      className="store"
      style={{ "--store-brand": t.color } as CSSProperties}
    >
      <header className="store-header">
        <a href="#inicio" className="store-brand">
          {tienda.logo ? (
            <img src={tienda.logo} alt={`Logo de ${tienda.nombre}`} />
          ) : (
            <span className="store-monogram">{tienda.nombre.slice(0, 1)}</span>
          )}
          <strong>{tienda.nombre}</strong>
        </a>
        <a href="#catalogo">Nuestro catálogo</a>
        {redesSociales.length > 0 && (
          <div className="store-redes">
            {redesSociales.map(({ key, url, Icon }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={key}>
                <Icon size={16} />
              </a>
            ))}
          </div>
        )}
        <a className="store-button" href="#carrito">
          <ShoppingBag size={17} />
          Tu pedido · {Object.values(carrito).reduce((s, n) => s + n, 0)}
        </a>
      </header>
      <section
        className={`store-hero ${t.portada ? "with-photo" : ""}`}
        id="inicio"
      >
        <div>
          <p className="store-eyebrow">
            DIRECTO DE NUESTRO NEGOCIO A TU PUERTA
          </p>
          <h1>{t.titulo || `Bienvenido a ${tienda.nombre}`}</h1>
          <p>
            {t.descripcion ||
              "Explora nuestro catálogo y elige tus favoritos. Estamos aquí para atenderte."}
          </p>
          <a className="store-button" href="#catalogo">
            Explorar productos ↘
          </a>
          <div className="store-meta">
            {t.horario && <span><Clock size={15} />{t.horario}</span>}
            {tienda.direccion && <span><MapPin size={15} />{tienda.direccion}</span>}
          </div>
        </div>
        {t.portada && <img src={t.portada} alt={`Conoce ${tienda.nombre}`} />}
      </section>
      <section className="store-benefits">
        {BENEFICIOS.map(({ icon: Icon, titulo, texto }) => (
          <div key={titulo} className="store-benefit">
            <span className="store-benefit-icon">
              <Icon size={20} />
            </span>
            <div>
              <strong>{titulo}</strong>
              <p>{texto}</p>
            </div>
          </div>
        ))}
      </section>
      {t.sobreNosotros && (
        <section className="store-sobre">
          <div className="store-sobre-texto">
            <p className="store-eyebrow">CONÓCENOS</p>
            <h2>Sobre {tienda.nombre}</h2>
            <p>{t.sobreNosotros}</p>
            {redesSociales.length > 0 && (
              <div className="store-redes store-redes-grande">
                {redesSociales.map(({ key, url, Icon }) => (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={key}>
                    <Icon size={18} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
      <div className="store-layout">
        <section id="catalogo">
          <div className="store-catalog-heading">
            <div>
              <p className="store-eyebrow">ELIGE A TU GUSTO</p>
              <h2>Nuestro catálogo</h2>
            </div>
            <label className="store-search">
              Buscar
              <div className="store-search-box">
                <Search size={16} />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="¿Qué estás buscando?"
                />
              </div>
            </label>
          </div>
          <div className="store-categories">
            {cats.map((c) => (
              <button
                key={c}
                aria-pressed={categoria === c}
                onClick={() => setCategoria(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {!tienda.productos.length && (
            <p className="store-empty">
              <PackageSearch size={22} />
              Estamos preparando nuestro catálogo. Vuelve pronto o contáctanos.
            </p>
          )}
          <div className="store-products">
            {tienda.productos
              .filter(
                (p) =>
                  (categoria === "Todos" || p.categoria.nombre === categoria) &&
                  p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
              )
              .map((p) => (
                <article className="store-product" key={p.id}>
                  {p.imagen ? (
                    <img loading="lazy" src={p.imagen} alt={p.nombre} />
                  ) : (
                    <div className="store-product-placeholder">
                      <span>{p.categoria.nombre}</span>
                      <strong>{p.nombre}</strong>
                    </div>
                  )}
                  <div>
                    <small>{p.categoria.nombre}</small>
                    <h3>{p.nombre}</h3>
                    <p>{p.descripcion}</p>
                    <footer>
                      <strong>{dinero(Number(p.precio))}</strong>
                      <button
                        disabled={!p.disponible || enviando}
                        onClick={() => cambiar(p.id, 1)}
                        aria-label={`Agregar ${p.nombre}`}
                      >
                        {p.disponible ? (<><Plus size={14} />Agregar</>) : "Agotado"}
                      </button>
                    </footer>
                  </div>
                </article>
              ))}
          </div>
        </section>
        <aside id="carrito" className="store-cart">
          <div className="store-cart-heading">
            <div>
              <p className="store-eyebrow">HECHO A TU MEDIDA</p>
              <h2>Tu pedido</h2>
            </div>
            {items.length > 0 && !enviando && (
              <button type="button" className="store-cart-clear" onClick={vaciarCarrito}>
                <Trash2 size={14} /> Vaciar
              </button>
            )}
          </div>
          {pedido && (
            <div role="status" className="store-success">
              <strong><CheckCircle2 size={17} />Solicitud recibida</strong>
              <p>Referencia: {pedido.id.slice(0, 8)}</p>
              <p>Estado: {pedido.estado.replaceAll("_", " ")}</p>
              <p>{dinero(Number(pedido.total))}</p>
              {pedido.motivo && <p>{pedido.motivo}</p>}
              <small>
                La empresa revisa y confirma tu pedido. Esta solicitud no es un
                comprobante de pago.
              </small>
            </div>
          )}
          {!items.length ? (
            <p className="store-empty"><ShoppingBag size={22} />Agrega productos para comenzar.</p>
          ) : (
            <>
              <ul className="store-cart-items">
                {items.map((p) => (
                  <li key={p.id}>
                    <div>
                      <strong>{p.nombre}</strong>
                      <small>{dinero(Number(p.precio) * carrito[p.id])}</small>
                    </div>
                    <div className="store-quantity">
                      <button
                        disabled={enviando}
                        aria-label={`Quitar uno de ${p.nombre}`}
                        onClick={() => cambiar(p.id, -1)}
                      >
                        <Minus size={13} />
                      </button>
                      <input
                        key={carrito[p.id]}
                        type="text"
                        inputMode="numeric"
                        className="store-quantity-input"
                        defaultValue={carrito[p.id]}
                        disabled={enviando}
                        aria-label={`Cantidad de ${p.nombre}`}
                        onFocus={(e) => e.target.select()}
                        onBlur={(e) => escribirCantidad(p.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                      <button
                        disabled={enviando}
                        aria-label={`Agregar uno de ${p.nombre}`}
                        onClick={() => cambiar(p.id, 1)}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="store-cart-remove"
                      disabled={enviando}
                      aria-label={`Eliminar ${p.nombre} del pedido`}
                      title="Eliminar"
                      onClick={() => quitarDelCarrito(p.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="store-total">
                <span>Productos</span>
                <strong>{dinero(subtotal)}</strong>
              </p>
              {t.pedidosHabilitados ? (
                <form onSubmit={enviar}>
                  <fieldset disabled={enviando}>
                    <legend>Datos para el domicilio</legend>
                    {(["nombre", "telefono", "direccion"] as const).map((k) => (
                      <label key={k}>
                        {
                          {
                            nombre: "Tu nombre",
                            telefono: "Teléfono de contacto",
                            direccion: "Dirección completa",
                          }[k]
                        }
                        <input
                          required
                          maxLength={k === "direccion" ? 300 : 100}
                          autoComplete={
                            k === "nombre"
                              ? "name"
                              : k === "telefono"
                                ? "tel"
                                : "street-address"
                          }
                          type={k === "telefono" ? "tel" : "text"}
                          value={form[k]}
                          onChange={(e) => {
                            clave.current = "";
                            setForm({ ...form, [k]: e.target.value });
                          }}
                        />
                      </label>
                    ))}
                    <label>
                      Zona de entrega
                      <select
                        required
                        value={form.zona}
                        onChange={(e) => {
                          clave.current = "";
                          setForm({ ...form, zona: e.target.value });
                        }}
                      >
                        <option value="">Selecciona tu zona</option>
                        {t.zonas.map((z) => (
                          <option key={z.nombre} value={z.nombre}>
                            {z.nombre} · {dinero(z.costo)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Forma de pago al confirmar
                      <select
                        value={form.metodoPago}
                        onChange={(e) =>
                          setForm({ ...form, metodoPago: e.target.value })
                        }
                      >
                        <option>EFECTIVO</option>
                        <option>TRANSFERENCIA</option>
                        <option>NEQUI</option>
                        <option>DAVIPLATA</option>
                      </select>
                    </label>
                    <label>
                      Indicaciones
                      <textarea
                        maxLength={500}
                        value={form.observacion}
                        onChange={(e) =>
                          setForm({ ...form, observacion: e.target.value })
                        }
                      />
                    </label>
                    <p className="store-total">
                      <span>Domicilio</span>
                      <strong>
                        {zona ? dinero(zona.costo) : "Por seleccionar"}
                      </strong>
                    </p>
                    <p className="store-total">
                      <span>Total</span>
                      <strong>{dinero(total)}</strong>
                    </p>
                    {subtotal < t.minimo && (
                      <p>Pedido mínimo: {dinero(t.minimo)}</p>
                    )}
                    <label className="store-consent">
                      <input required type="checkbox" />
                      Autorizo a {tienda.nombre} a usar estos datos para atender
                      y entregar este pedido.
                    </label>
                    <button
                      className="store-button"
                      disabled={
                        enviando ||
                        subtotal < t.minimo ||
                        items.some((p) => !p.disponible)
                      }
                    >
                      {enviando ? "Enviando…" : "Enviar pedido a la empresa"}
                    </button>
                  </fieldset>
                </form>
              ) : (
                <p>
                  Los pedidos web están pausados. Puedes consultar a la empresa
                  por sus canales de contacto.
                </p>
              )}
              {t.whatsapp && (
                <a
                  className="store-whatsapp"
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon size={16} /> Prefiero pedir por WhatsApp
                </a>
              )}
              <small>
                WhatsApp abre una conversación; el pedido no se registra
                automáticamente en caja.
              </small>
            </>
          )}
          {error && (
            <div role="alert" className="store-error">
              <p><AlertCircle size={16} />{error}</p>
              <button
                onClick={() => {
                  clave.current = "";
                  setError("");
                  void cargar();
                }}
              >
                Actualizar catálogo
              </button>
            </div>
          )}
        </aside>
      </div>
      <footer className="store-footer">
        <div className="store-footer-brand">
          <strong>{tienda.nombre}</strong>
          <small>Tienda conectada con PowerPOS</small>
        </div>
        <div className="store-footer-info">
          {tienda.telefono && <span>{tienda.telefono}</span>}
          {tienda.direccion && <span><MapPin size={14} />{tienda.direccion}</span>}
          {t.horario && <span><Clock size={14} />{t.horario}</span>}
        </div>
        {redesSociales.length > 0 && (
          <div className="store-redes store-redes-footer">
            {redesSociales.map(({ key, url, Icon }) => (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={key}>
                <Icon size={17} />
              </a>
            ))}
          </div>
        )}
        {t.whatsapp && (
          <a
            className="store-footer-whatsapp"
            href={`https://wa.me/${t.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppIcon size={16} /> Contáctanos por WhatsApp
          </a>
        )}
      </footer>

      {t.whatsapp && (
        <a
          className="store-whatsapp-float"
          href={`https://wa.me/${t.whatsapp}?text=${encodeURIComponent(`Hola ${tienda.nombre}, quiero más información.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Escríbenos por WhatsApp a ${tienda.nombre}`}
          title="Escríbenos por WhatsApp"
        >
          <WhatsAppIcon size={26} />
        </a>
      )}

      {items.length > 0 && (
        <a href="#carrito" className="store-mobile-cart">
          <span>
            <ShoppingBag size={17} />
            {Object.values(carrito).reduce((s, n) => s + n, 0)} producto(s)
          </span>
          <strong>{dinero(subtotal)}</strong>
        </a>
      )}

      {mostrarSubir && (
        <button
          type="button"
          className="store-scroll-top"
          aria-label="Volver arriba"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp size={18} />
        </button>
      )}
    </main>
  );
}
