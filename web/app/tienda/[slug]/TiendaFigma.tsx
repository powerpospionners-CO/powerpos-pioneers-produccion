"use client";
import {
  FormEvent,
  useMemo,
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  type CSSProperties,
} from "react";
import { responderTienda } from "../../../lib/atencionTienda";
import { temaTienda } from "../../../lib/temaTienda";
import type { TiendaPublica } from "../../../lib/tiendaPublica";
import { PedidoTienda } from "./PedidoTienda";
import "./tienda.css";
const Marca = createContext({ nombre: "", logo: "" });

type Product = {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  country: string;
  image: string;
  disponible: boolean;
  size: string;
  heat: string;
  imagePosition: string;
};

type CartItem = Product & { quantity: number };

const money = (value: number) => `$${value.toLocaleString("es-CO")}`;

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    cart: (
      <>
        <path d="M3 4h2l2 11h10l2-8H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="17" cy="20" r="1" />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    trash: (
      <>
        <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    chat: (
      <>
        <path d="M20 15a3 3 0 0 1-3 3H9l-5 3 1.6-4A7 7 0 0 1 4 12V9a5 5 0 0 1 5-5h8a3 3 0 0 1 3 3Z" />
      </>
    ),
    send: <path d="m3 11 18-8-7 18-3-7-8-3Zm8 3 4-4" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    instagram: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r=".5" fill="currentColor" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    whatsapp: (
      <>
        <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z" />
        <path d="M9 8.5c.5 2 2 3.5 4.5 4.5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    check: <path d="m5 12 4 4 10-10" />,
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  const marca = useContext(Marca);
  return (
    <a
      className={`logo ${light ? "logo-light" : ""}`}
      href="#inicio"
      aria-label={`${marca.nombre}, inicio`}
    >
      {marca.logo ? (
        <img className="company-logo" src={marca.logo} alt={marca.nombre} />
      ) : (
        <span className="logo-mark">{marca.nombre.slice(0, 1)}</span>
      )}
      <span>
        <strong>{marca.nombre}</strong>
        <small>TIENDA EN LÍNEA</small>
      </span>
    </a>
  );
}

function Quantity({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (n: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`quantity ${compact ? "compact" : ""}`}
      aria-label="Selector de cantidad"
    >
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label="Disminuir cantidad"
      >
        <Icon name="minus" size={15} />
      </button>
      <span>{value}</span>
      <button
        onClick={() => onChange(Math.min(9999, value + 1))}
        aria-label="Aumentar cantidad"
      >
        <Icon name="plus" size={15} />
      </button>
    </div>
  );
}

function ProductImage({
  product,
  className = "",
}: {
  product: Product;
  className?: string;
}) {
  return (
    <div
      className={`product-photo ${className}`}
      style={{
        backgroundImage: product.image
          ? `url(${JSON.stringify(product.image)})`
          : "none",
        backgroundPosition: "center",
        backgroundSize: "contain",
      }}
    >
      {product.country && (
        <span className="country-badge">{product.country}</span>
      )}
      {!product.image && (
        <span className="image-placeholder">{product.name}</span>
      )}
    </div>
  );
}

function App({ tienda, slug }: { tienda: TiendaPublica; slug: string }) {
  const t = tienda.config;
  const products: Product[] = useMemo(
    () =>
      tienda.productos.map((p) => ({
        id: p.id,
        name: p.nombre,
        description: p.descripcion || "",
        price: Number(p.precio),
        category: p.categoria.nombre,
        country: p.origen || "",
        size: p.presentacion || "Consultar presentación",
        heat: p.disponible ? "Disponible para consultar" : "Agotado",
        imagePosition: "center",
        image: p.imagen || "",
        disponible: p.disponible,
      })),
    [tienda.productos],
  );
  const categories = useMemo(
    () =>
      [...new Set(products.map((p) => p.category))].map((name, i) => ({
        name,
        kicker: "Descubre la selección",
        pos: "center",
        tone: ["orange", "red", "green", "purple", "ochre"][i % 5],
        image:
          products.find((p) => p.category === name && p.image)?.image || "",
      })),
    [products],
  );
  const origins = [...new Set(products.map((p) => p.country).filter(Boolean))];
  const telefono = (t.whatsapp || tienda.telefono || "").replace(/\D/g, "");
  const whatsappNumero = telefono.length === 10 ? "57" + telefono : telefono;
  const whatsappUrl = /^\d{10,15}$/.test(whatsappNumero)
    ? "https://wa.me/" + whatsappNumero
    : "";
  const instagram = t.instagram
    ? /^https:\/\//.test(t.instagram)
      ? t.instagram
      : "https://instagram.com/" + t.instagram.replace(/^@/, "")
    : "";
  const titulo = t.titulo || tienda.nombre;
  const palabrasTitulo = titulo.trim().split(/\s+/);
  const acento = palabrasTitulo.pop();
  const portada = t.portada || "/tienda/portada-ingredientes.png";
  const tema = temaTienda(
    t.color,
    t.coloresAutomaticos !== false ? t.paletaLogo?.secundario : undefined,
  );
  const style = {
    ...tema,
    "--orange": tema["--store-brand"],
    "--orange-dark": tema["--store-brand"],
    "--cream": "color-mix(in srgb, var(--orange) 8%, #fffaf0)",
    "--paper": "color-mix(in srgb, var(--orange) 2%, white)",
    "--green": tema["--store-secondary"],
    "--brand-on": tema["--store-on-brand"],
    "--hero-image": `url(${JSON.stringify(portada)})`,
  } as CSSProperties;
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [country, setCountry] = useState("Todos");
  const [sort, setSort] = useState("destacados");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("pedido")) {
      setCartOpen(true);
      setCheckout(true);
    }
  }, []);
  const [toast, setToast] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { from: "user" | "bot"; text: string }[]
  >([]);
  const [chatProductos, setChatProductos] = useState<number[]>([]);
  const [chatInput, setChatInput] = useState("");
  const typing = false;
  const [chatFailed, setChatFailed] = useState(false);
  const [delivery, setDelivery] = useState("recogida");
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const active = selected || cartOpen;
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = el.querySelector<HTMLElement>(
      selected ? ".product-modal" : ".cart-drawer",
    );
    panel?.querySelector<HTMLElement>("button,input,a[href]")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setCartOpen(false);
      }
      if (e.key === "Tab" && panel) {
        const nodes = [
          ...panel.querySelectorAll<HTMLElement>(
            "button:not(:disabled),a[href],input,select,textarea",
          ),
        ];
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, [selected, cartOpen, checkout]);
  const [orderData, setOrderData] = useState({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = products.filter(
      (p) =>
        (!term ||
          `${p.name} ${p.description} ${p.country} ${p.category}`
            .toLowerCase()
            .includes(term)) &&
        (category === "Todos" || p.category === category) &&
        (country === "Todos" || p.country === country),
    );
    return [...list].sort((a, b) =>
      sort === "menor"
        ? a.price - b.price
        : sort === "mayor"
          ? b.price - a.price
          : a.id - b.id,
    );
  }, [search, category, country, sort, products]);

  const currentCart = cart.map((item) => ({
    ...item,
    ...products.find((p) => p.id === item.id),
    disponible: products.some((p) => p.id === item.id && p.disponible),
  }));
  const totalCount = currentCart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = currentCart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const addToCart = (
    product: Product,
    quantity = quantities[product.id] || 1,
  ) => {
    if (!product.disponible) return;
    setCart((current) => {
      const found = current.find((item) => item.id === product.id);
      return found
        ? current.map((item) =>
            item.id === product.id
              ? { ...item, quantity: Math.min(9999, item.quantity + quantity) }
              : item,
          )
        : [...current, { ...product, quantity }];
    });
    setToast(`${product.name} se agregó al carrito`);
    window.setTimeout(() => setToast(""), 2600);
  };

  const updateCart = (id: number, quantity: number) =>
    setCart((current) =>
      current.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  const removeCart = (id: number) =>
    setCart((current) => current.filter((item) => item.id !== id));

  const applyCategory = (name: string) => {
    setCategory(name);
    document
      .querySelector("#productos")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const quickChat = (label: string) => {
    setChatFailed(false);
    setChatMessages((c) => [...c, { from: "user", text: label }]);
    if (label === "Hablar con un asesor") {
      if (whatsappUrl)
        window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      else
        setChatMessages((c) => [
          ...c,
          {
            from: "bot",
            text: tienda.telefono
              ? "Puedes comunicarte al " + tienda.telefono
              : "El negocio todavía no ha configurado un canal de contacto.",
          },
        ]);
      return;
    }
    let response =
      "Puedo ayudarte a buscar en el catálogo. Para entregas, pagos y otras consultas, contacta directamente con el negocio.";
    if (label === "Consultar mi carrito") {
      setCartOpen(true);
      setChatOpen(false);
      response = totalCount
        ? `Tienes ${totalCount} productos por ${money(subtotal)}.`
        : "Tu carrito está vacío.";
    } else if (label === "Cómo hacer un pedido")
      response =
        "Agrega productos al carrito, revisa cantidades y completa tus datos. Una solicitud no confirma el pago ni la entrega.";
    else if (label === "Buscar un producto") {
      document.querySelector<HTMLInputElement>("#buscador-tienda")?.focus();
      response = "Escribe el nombre en el buscador o en este chat.";
    } else {
      const resultado = responderTienda(
        label.replace(/^Ver /, "").replace(/^Quiero consultar /, ""),
        tienda,
        chatProductos,
      );
      response = resultado.texto;
      setChatFailed(resultado.derivar);
      setChatProductos(resultado.productoIds);
    }
    setChatMessages((c) => [...c, { from: "bot", text: response }]);
  };

  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput;
    setChatInput("");
    quickChat(text);
  };

  const whatsappOrder = () => {
    const lines = cart
      .map((i) => `• ${i.name} x${i.quantity} — ${money(i.price * i.quantity)}`)
      .join("\n");
    const deliveryText =
      delivery === "domicilio"
        ? `Domicilio${orderData.address ? `: ${orderData.address}` : ""}`
        : "Recogida (sujeta a confirmación)";
    const message = `Hola, ${tienda.nombre}. Quiero consultar este pedido:\n\n${lines}\n\nSubtotal productos: ${money(subtotal)}\nEnvío: Por confirmar\n\nNombre: ${orderData.name}\nTeléfono: ${orderData.phone}\nEntrega: ${deliveryText}\nNotas: ${orderData.notes || "Sin notas"}\n\nEntiendo que disponibilidad, envío y pago se confirman por WhatsApp.`;
    if (whatsappUrl)
      window.open(
        `${whatsappUrl}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
  };

  return (
    <Marca.Provider value={{ nombre: tienda.nombre, logo: tienda.logo || "" }}>
      <div ref={panelRef} className="figma-store app-shell" style={style}>
        <div className="announcement">
          {tienda.nombre} <span />{" "}
          {t.horario || "Consulta disponibilidad y entrega con el negocio"}
        </div>
        <header className="site-header">
          <div className="nav-wrap">
            <button
              className="mobile-menu-button"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label="Abrir menú"
            >
              <Icon name={mobileMenu ? "close" : "menu"} />
            </button>
            <Logo />
            <nav
              className={mobileMenu ? "open" : ""}
              aria-label="Navegación principal"
            >
              <a href="#inicio" onClick={() => setMobileMenu(false)}>
                Inicio
              </a>
              <a href="#productos" onClick={() => setMobileMenu(false)}>
                Productos
              </a>
              <a href="#nosotros" onClick={() => setMobileMenu(false)}>
                Nosotros
              </a>
              <a href="#contacto" onClick={() => setMobileMenu(false)}>
                Contacto
              </a>
            </nav>
            <div className="header-actions">
              <a
                className="whatsapp-link"
                href={whatsappUrl || "#contacto"}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="whatsapp" />
                <span>WhatsApp</span>
              </a>
              <button
                className="cart-button"
                onClick={() => {
                  setCartOpen(true);
                  setCheckout(false);
                }}
                aria-label={`Carrito con ${totalCount} productos`}
              >
                <Icon name="cart" />
                <span>{totalCount}</span>
              </button>
            </div>
            <label className="header-search">
              <Icon name="search" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    document
                      .querySelector("#productos")
                      ?.scrollIntoView({ behavior: "smooth" });
                }}
                id="buscador-tienda"
                placeholder="¿Qué estás buscando?"
                aria-label="Buscar productos"
              />
            </label>
          </div>
        </header>

        <main>
          <section className="hero" id="inicio">
            <div className="hero-copy">
              <div className="eyebrow">
                <span /> {t.antetitulo || "DESCUBRE NUESTRA SELECCIÓN"}
              </div>
              <h1>
                {palabrasTitulo.join(" ")} <em>{acento}</em>
              </h1>
              <p>
                {t.descripcion ||
                  "Encuentra tus favoritos en nuestro catálogo y consulta directamente con nuestro equipo."}
              </p>
              <div className="hero-actions">
                <a className="button primary" href="#productos">
                  Explorar productos <Icon name="arrow" />
                </a>
                <a
                  className="button secondary"
                  href={whatsappUrl || "#contacto"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="whatsapp" /> Pedir por WhatsApp
                </a>
              </div>
              <div className="hero-notes">
                <span>
                  <Icon name="check" size={16} /> {tienda.nombre}
                </span>
                <span>
                  <Icon name="check" size={16} />{" "}
                  {t.horario || "Atención directa"}
                </span>
              </div>
            </div>
            <div className="hero-visual">
              <div
                className="hero-image"
                role="img"
                aria-label={`Portada de ${tienda.nombre}`}
              />
              <div className="floating-card fc-one">
                <small>{t.portadaEtiqueta || "NUESTRA SELECCIÓN"}</small>
                <strong>{t.portadaTexto || "Encuentra tus favoritos"}</strong>
              </div>
              {origins.length > 0 && (
                <div
                  className="floating-card fc-two"
                  aria-label="Orígenes de nuestros productos"
                >
                  <span>{origins.slice(0, 2).join(" · ")}</span>
                </div>
              )}
            </div>
          </section>

          <section className="section categories-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  <span /> Explora por categoría
                </div>
                <h2>
                  Encuentra tus próximos <em>favoritos</em>
                </h2>
              </div>
              <p>
                Explora nuestra selección y encuentra lo que estás buscando.
              </p>
            </div>
            <div className="category-grid">
              {categories.map((item, index) => (
                <button
                  key={item.name}
                  className={`category-card ${item.tone}`}
                  onClick={() => applyCategory(item.name)}
                >
                  <div
                    className="category-image"
                    style={{
                      backgroundPosition: item.pos,
                      backgroundImage: item.image
                        ? `url(${JSON.stringify(item.image)})`
                        : "var(--hero-image)",
                    }}
                  />
                  <span className="category-index">0{index + 1}</span>
                  <div>
                    <small>{item.kicker}</small>
                    <strong>{item.name}</strong>
                  </div>
                  <span className="round-arrow">
                    <Icon name="arrow" size={18} />
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="section products-section" id="productos">
            <div className="section-heading product-title">
              <div>
                <div className="eyebrow">
                  <span /> NUESTRO CATÁLOGO
                </div>
                <h2>
                  Productos <em>destacados</em>
                </h2>
              </div>
              <p>
                Consulta los productos de nuestro negocio. Confirma
                disponibilidad y entrega con nuestro equipo.
              </p>
            </div>
            <div className="catalog-toolbar">
              <div
                className="filter-row"
                role="group"
                aria-label="Filtrar por categoría"
              >
                {["Todos", ...categories.map((c) => c.name)].map((item) => (
                  <button
                    key={item}
                    className={category === item ? "active" : ""}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="select-row">
                {origins.length > 0 && (
                  <div
                    className="filter-row"
                    role="group"
                    aria-label="Filtrar por origen"
                  >
                    {["Todos", ...origins].map((origin) => (
                      <button
                        key={origin}
                        type="button"
                        aria-pressed={country === origin}
                        className={country === origin ? "active" : ""}
                        onClick={() => setCountry(origin)}
                      >
                        {origin === "Todos" ? "Todos los orígenes" : origin}
                      </button>
                    ))}
                  </div>
                )}
                <label>
                  Ordenar
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="destacados">Destacados</option>
                    <option value="menor">Menor precio</option>
                    <option value="mayor">Mayor precio</option>
                  </select>
                </label>
              </div>
            </div>
            {(search || category !== "Todos" || country !== "Todos") && (
              <div className="results-bar">
                <span>
                  <strong>{filtered.length}</strong> resultado
                  {filtered.length === 1 ? "" : "s"}{" "}
                  {search && <>para “{search}”</>}
                </span>
                <button
                  onClick={() => {
                    setSearch("");
                    setCategory("Todos");
                    setCountry("Todos");
                  }}
                >
                  Limpiar filtros <Icon name="close" size={15} />
                </button>
              </div>
            )}
            {filtered.length ? (
              <div className="product-grid">
                {filtered.map((product) => {
                  const quantity = quantities[product.id] || 1;
                  return (
                    <article className="product-card" key={product.id}>
                      <button
                        className="image-button"
                        onClick={() => setSelected(product)}
                        aria-label={`Ver detalle de ${product.name}`}
                      >
                        <ProductImage product={product} />
                        <span className="view-label">
                          Ver detalle <Icon name="arrow" size={16} />
                        </span>
                      </button>
                      <div className="product-info">
                        <div className="product-meta">
                          <span>{product.category}</span>
                          <small>{product.disponible ? "" : "Agotado"}</small>
                        </div>
                        <button
                          className="product-name"
                          onClick={() => setSelected(product)}
                        >
                          {product.name}
                        </button>
                        <p>{product.description}</p>
                        <div className="product-bottom">
                          <strong>{money(product.price)}</strong>
                          <Quantity
                            compact
                            value={quantity}
                            onChange={(n) =>
                              setQuantities((q) => ({ ...q, [product.id]: n }))
                            }
                          />
                        </div>
                        <button
                          className="add-button"
                          disabled={!product.disponible}
                          onClick={() => addToCart(product)}
                        >
                          <Icon name="cart" size={18} /> Agregar al carrito
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-results">
                <div className="empty-icon">
                  <Icon name="search" size={30} />
                </div>
                <h3>No encontramos ese producto</h3>
                <p>Prueba con otro término o consulta con nuestro equipo.</p>
                <button
                  className="button primary"
                  onClick={() => setChatOpen(true)}
                >
                  <Icon name="chat" /> Consultar por chat
                </button>
              </div>
            )}
          </section>

          <section className="about-section" id="nosotros">
            <div className="about-image">
              <div className="about-stamp">
                {tienda.nombre}
                <br />
                <strong>CO</strong>
              </div>
            </div>
            <div className="about-copy">
              <div className="eyebrow light">
                <span /> Sobre {tienda.nombre}
              </div>
              <h2>
                Conoce nuestra
                <br />
                <em>historia.</em>
              </h2>
              <p>
                {t.sobreNosotros ||
                  t.descripcion ||
                  `En ${tienda.nombre} estamos para ayudarte a encontrar tus favoritos.`}
              </p>
              <p>
                Explora nuestro catálogo y consulta directamente con el negocio
                para confirmar disponibilidad, presentación y opciones de
                entrega.
              </p>
              <a href="#contacto" className="text-link">
                Conoce cómo contactarnos <Icon name="arrow" />
              </a>
            </div>
          </section>

          <section className="contact-section section" id="contacto">
            <div className="contact-card">
              <div>
                <div className="eyebrow">
                  <span /> ¿Buscas algo especial?
                </div>
                <h2>
                  Hablemos de <em>lo que buscas</em>
                </h2>
                <p>
                  Cuéntanos qué tienes en mente y consulta productos,
                  disponibilidad y entrega directamente con el negocio.
                </p>
              </div>
              <a
                className="button dark"
                href={whatsappUrl || "#contacto"}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="whatsapp" />{" "}
                {whatsappNumero
                  ? `Escribir al ${tienda.telefono || whatsappNumero}`
                  : "Ver contacto"}
              </a>
            </div>
            <div className="contact-links">
              <a
                href={whatsappUrl || "#contacto"}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <Icon name="whatsapp" />
                </span>
                <div>
                  <small>WhatsApp</small>
                  <strong>
                    {tienda.telefono || whatsappNumero || "Por configurar"}
                  </strong>
                </div>
                <Icon name="arrow" />
              </a>
              <a
                href={instagram || "#contacto"}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <Icon name="instagram" />
                </span>
                <div>
                  <small>Instagram</small>
                  <strong>{t.instagram || "Por configurar"}</strong>
                </div>
                <Icon name="arrow" />
              </a>
              <div>
                <span>
                  <Icon name="pin" />
                </span>
                <div>
                  <small>Ubicación</small>
                  <strong>
                    {tienda.direccion || "Consulta nuestra ubicación"}
                  </strong>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer>
          <div className="footer-main">
            <div>
              <Logo light />
              <p>{t.titulo || tienda.nombre}</p>
            </div>
            <nav>
              <strong>Explora</strong>
              <a href="#inicio">Inicio</a>
              <a href="#productos">Productos</a>
              <a href="#nosotros">Nosotros</a>
            </nav>
            <nav>
              <strong>Conversemos</strong>
              <a href={whatsappUrl || "#contacto"}>WhatsApp</a>
              <a href={instagram || "#contacto"}>Instagram</a>
              <a href="#contacto">Contacto</a>
            </nav>
            <div className="footer-note">
              <strong>Antes de pedir</strong>
              <p>
                Disponibilidad, envío y pago se confirman directamente por
                WhatsApp.
              </p>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {tienda.nombre}</span>
            <span>Tienda conectada con PowerPOS</span>
          </div>
        </footer>

        {selected && (
          <div
            className="modal-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <div
              className="product-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-modal-title"
            >
              <button
                className="close-button"
                onClick={() => setSelected(null)}
                aria-label="Cerrar detalle"
              >
                <Icon name="close" />
              </button>
              <ProductImage product={selected} className="detail-photo" />
              <div className="detail-content">
                <div className="eyebrow">
                  <span /> {selected.country || selected.category}
                </div>
                <h2 id="product-modal-title">{selected.name}</h2>
                <strong className="detail-price">
                  {money(selected.price)}
                </strong>
                <p>
                  {selected.description} La información de disponibilidad y
                  características se confirma con el negocio.
                </p>
                <div className="detail-specs">
                  <div>
                    <small>Presentación</small>
                    <strong>{selected.size}</strong>
                  </div>
                  <div>
                    <small>Disponibilidad</small>
                    <strong>{selected.heat}</strong>
                  </div>
                </div>
                <div className="detail-add">
                  <Quantity
                    value={quantities[selected.id] || 1}
                    onChange={(n) =>
                      setQuantities((q) => ({ ...q, [selected.id]: n }))
                    }
                  />
                  <button
                    className="button primary"
                    disabled={!selected.disponible}
                    onClick={() => addToCart(selected)}
                  >
                    Agregar al carrito
                  </button>
                </div>
                <button
                  className="consult-button"
                  onClick={() => {
                    setChatOpen(true);
                    setChatMinimized(false);
                    quickChat(`Quiero consultar ${selected.name}`);
                    setSelected(null);
                  }}
                >
                  <Icon name="chat" /> Consultar este producto
                </button>
                {products.length > 1 && (
                  <div className="related">
                    <small>También te puede gustar</small>
                    <button
                      onClick={() =>
                        setSelected(products[selected.id % products.length])
                      }
                    >
                      {products[selected.id % products.length].name}{" "}
                      <Icon name="arrow" size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div
          className={`drawer-backdrop ${cartOpen ? "visible" : ""}`}
          onClick={() => setCartOpen(false)}
        />
        <aside
          className={`cart-drawer ${cartOpen ? "open" : ""}`}
          aria-hidden={!cartOpen}
          inert={!cartOpen}
        >
          <div className="drawer-header">
            <div>
              <small>{checkout ? "Último paso" : "Tu selección"}</small>
              <h2>
                {checkout ? "Finalizar pedido" : `Carrito (${totalCount})`}
              </h2>
            </div>
            <button
              onClick={() => setCartOpen(false)}
              aria-label="Cerrar carrito"
            >
              <Icon name="close" />
            </button>
          </div>
          {!checkout ? (
            <>
              <div className="cart-content">
                {cart.length ? (
                  currentCart.map((item) => (
                    <div className="cart-item" key={item.id}>
                      <ProductImage product={item} />
                      <div>
                        <strong>{item.name}</strong>
                        <small>{money(item.price)} c/u</small>
                        <div className="cart-controls">
                          <Quantity
                            compact
                            value={item.quantity}
                            onChange={(n) => updateCart(item.id, n)}
                          />
                          <button
                            onClick={() => removeCart(item.id)}
                            aria-label={`Eliminar ${item.name}`}
                          >
                            <Icon name="trash" size={17} />
                          </button>
                        </div>
                      </div>
                      <b>{money(item.price * item.quantity)}</b>
                    </div>
                  ))
                ) : (
                  <div className="empty-cart">
                    <div>
                      <Icon name="cart" size={34} />
                    </div>
                    <h3>Tu carrito está esperando</h3>
                    <p>Explora nuestro catálogo y agrega tus favoritos.</p>
                    <button
                      className="button primary"
                      onClick={() => setCartOpen(false)}
                    >
                      Explorar productos
                    </button>
                  </div>
                )}
              </div>
              {cart.length > 0 && (
                <div className="cart-summary">
                  <div>
                    <span>Subtotal productos</span>
                    <strong>{money(subtotal)}</strong>
                  </div>
                  <div>
                    <span>Envío</span>
                    <strong>Por confirmar</strong>
                  </div>
                  <p>
                    El importe corresponde a los productos. El envío aún no está
                    incluido.
                  </p>
                  <button
                    className="button primary full"
                    onClick={() => setCheckout(true)}
                  >
                    Finalizar pedido <Icon name="arrow" />
                  </button>
                  <button
                    className="button text full"
                    onClick={() => setCartOpen(false)}
                  >
                    Seguir comprando
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="checkout-content">
              <button className="back-link" onClick={() => setCheckout(false)}>
                ← Volver al carrito
              </button>
              <div className="order-mini-summary">
                <div>
                  <span>{totalCount} productos</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <small>Envío: Por confirmar</small>
              </div>
              {t.pedidosHabilitados ? (
                <PedidoTienda
                  tienda={tienda}
                  slug={slug}
                  items={currentCart}
                  onRecibido={() => {
                    setCart([]);
                  }}
                />
              ) : (
                <>
                  {" "}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      whatsappOrder();
                    }}
                  >
                    <label>
                      Nombre
                      <input
                        required
                        value={orderData.name}
                        onChange={(e) =>
                          setOrderData({ ...orderData, name: e.target.value })
                        }
                        placeholder="Tu nombre"
                      />
                    </label>
                    <label>
                      Teléfono
                      <input
                        required
                        type="tel"
                        value={orderData.phone}
                        onChange={(e) =>
                          setOrderData({ ...orderData, phone: e.target.value })
                        }
                        placeholder="Tu número de contacto"
                      />
                    </label>
                    <fieldset>
                      <legend>Método de entrega</legend>
                      <div className="radio-grid">
                        <label
                          className={delivery === "domicilio" ? "checked" : ""}
                        >
                          <input
                            type="radio"
                            name="delivery"
                            value="domicilio"
                            checked={delivery === "domicilio"}
                            onChange={(e) => setDelivery(e.target.value)}
                          />
                          Domicilio
                        </label>
                        <label
                          className={delivery === "recogida" ? "checked" : ""}
                        >
                          <input
                            type="radio"
                            name="delivery"
                            value="recogida"
                            checked={delivery === "recogida"}
                            onChange={(e) => setDelivery(e.target.value)}
                          />
                          Recogida
                        </label>
                      </div>
                      <small>Sujeto a confirmación del negocio.</small>
                    </fieldset>
                    {delivery === "domicilio" && (
                      <label>
                        Dirección
                        <input
                          required
                          value={orderData.address}
                          onChange={(e) =>
                            setOrderData({
                              ...orderData,
                              address: e.target.value,
                            })
                          }
                          placeholder="Dirección para consultar entrega"
                        />
                      </label>
                    )}
                    <label>
                      Notas adicionales
                      <textarea
                        value={orderData.notes}
                        onChange={(e) =>
                          setOrderData({ ...orderData, notes: e.target.value })
                        }
                        placeholder="Indicaciones o preguntas"
                        rows={3}
                      />
                    </label>
                    <div className="confirmation-note">
                      <Icon name="chat" />
                      <p>
                        Este paso{" "}
                        <strong>
                          no realiza un pago ni confirma el pedido.
                        </strong>{" "}
                        La disponibilidad, el envío y el pago se coordinan por
                        WhatsApp.
                      </p>
                    </div>
                    <button
                      className="button primary full"
                      type="submit"
                      disabled={
                        !whatsappUrl || currentCart.some((p) => !p.disponible)
                      }
                    >
                      <Icon name="whatsapp" /> Enviar pedido por WhatsApp
                    </button>
                  </form>
                </>
              )}
            </div>
          )}
        </aside>

        {toast && (
          <div className="toast">
            <span>
              <Icon name="check" size={16} />
            </span>
            <div>
              <strong>¡Listo!</strong>
              <small>{toast}</small>
            </div>
            <button
              onClick={() => {
                setCartOpen(true);
                setToast("");
              }}
            >
              Ver carrito
            </button>
          </div>
        )}

        {chatOpen && !chatMinimized && (
          <section
            className="chat-window"
            aria-label={`Chat de ${tienda.nombre}`}
          >
            <header>
              <div className="chat-avatar">
                <Logo />
              </div>
              <div>
                <strong>Asistente {tienda.nombre}</strong>
                <small>
                  <span /> Atención virtual
                </small>
              </div>
              <button
                onClick={() => setChatMinimized(true)}
                aria-label="Minimizar chat"
              >
                <Icon name="minus" />
              </button>
              <button
                onClick={() => setChatOpen(false)}
                aria-label="Cerrar chat"
              >
                <Icon name="close" />
              </button>
            </header>
            <div
              className="chat-body"
              role="log"
              aria-live="polite"
              style={{ whiteSpace: "pre-line" }}
            >
              <div className="bot-message">
                ¡Hola! Bienvenido a {tienda.nombre}. ¿Qué estás buscando hoy?
              </div>
              {chatMessages.map((message, index) => (
                <div key={index} className={`${message.from}-message`}>
                  {message.text}
                </div>
              ))}
              {typing && (
                <div className="typing" aria-label="Escribiendo">
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {chatFailed && (
                <div className="chat-failed">
                  <strong>No pudimos consultar esa información</strong>
                  <span>
                    Inventario, entrega y pagos requieren confirmación del
                    negocio.
                  </span>
                  <button
                    onClick={() => {
                      setChatFailed(false);
                      quickChat("Buscar un producto");
                    }}
                  >
                    Reintentar otra consulta
                  </button>
                </div>
              )}
              {!chatMessages.length && (
                <div className="quick-options">
                  {[
                    "Buscar un producto",
                    ...categories.slice(0, 2).map((c) => `Ver ${c.name}`),
                    "Consultar mi carrito",
                    "Cómo hacer un pedido",
                    "Hablar con un asesor",
                  ].map((label) => (
                    <button key={label} onClick={() => quickChat(label)}>
                      {label}
                      <Icon name="arrow" size={14} />
                    </button>
                  ))}
                </div>
              )}
              {chatMessages.length > 0 &&
                chatProductos.length > 0 &&
                products.some((p) => p.id === chatProductos[0]) && (
                  <div className="chat-recommendation">
                    <ProductImage
                      product={products.find((p) => p.id === chatProductos[0])!}
                    />
                    <div>
                      <small>Producto consultado</small>
                      <strong>
                        {products.find((p) => p.id === chatProductos[0])?.name}
                      </strong>
                      <button
                        onClick={() => {
                          setSelected(
                            products.find((p) => p.id === chatProductos[0]) ||
                              null,
                          );
                          setChatOpen(false);
                        }}
                      >
                        Ver producto
                      </button>
                    </div>
                  </div>
                )}
            </div>
            <a
              className="chat-whatsapp"
              href={whatsappUrl || "#contacto"}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="whatsapp" /> Continuar con un asesor por WhatsApp
            </a>
            <form onSubmit={submitChat}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Escribe tu pregunta..."
                aria-label="Mensaje para el chat"
                maxLength={500}
              />
              <button type="submit" aria-label="Enviar mensaje">
                <Icon name="send" />
              </button>
            </form>
            <small className="chat-disclaimer">
              La información de inventario, entrega y pagos se confirma con un
              asesor.
            </small>
          </section>
        )}
        <button
          className={`chat-fab ${chatOpen && !chatMinimized ? "hidden" : ""}`}
          onClick={() => {
            setChatOpen(true);
            setChatMinimized(false);
          }}
          aria-label="Abrir chat de atención"
        >
          <Icon name="chat" size={25} />
          <span>¿Te ayudamos?</span>
        </button>
      </div>
    </Marca.Provider>
  );
}

export default App;
