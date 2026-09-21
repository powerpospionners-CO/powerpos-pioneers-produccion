"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import {
  ShoppingBag,
  Search,
  MapPin,
  Clock,
  MessageCircle,
  Minus,
  Plus,
  CheckCircle2,
  AlertCircle,
  PackageSearch,
} from "lucide-react";
import "./tienda.css";

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
    color: string;
    portada: string;
    whatsapp: string;
    horario: string;
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
  useEffect(() => { if (tienda) document.title = `${tienda.nombre} · Tienda en línea`; }, [tienda]);
  const enviandoRef = useRef(false);
  const cargar = () =>
    request(`/tiendas/${encodeURIComponent(slug)}`)
      .then(setTienda)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
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
      [id]: Math.min(99, Math.max(0, (c[id] || 0) + delta)),
    }));
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
          <p className="store-eyebrow">HECHO A TU MEDIDA</p>
          <h2>Tu pedido</h2>
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
                      <span>{carrito[p.id]}</span>
                      <button
                        disabled={enviando}
                        aria-label={`Agregar uno de ${p.nombre}`}
                        onClick={() => cambiar(p.id, 1)}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
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
                  <MessageCircle size={16} /> Prefiero pedir por WhatsApp
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
        <strong>{tienda.nombre}</strong>
        <span>{tienda.telefono}</span>
        {t.whatsapp && (
          <a
            href={`https://wa.me/${t.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} /> Contáctanos por WhatsApp
          </a>
        )}
        <small>Tienda conectada con PowerPOS</small>
      </footer>
    </main>
  );
}
