"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { Download, PackageSearch, Search } from "lucide-react";
import "./catalogo.css";

type Producto = {
  id: number;
  nombre: string;
  presentacion: string | null;
  descripcion: string | null;
  precio: string | null;
  categoria: string | null;
  imagen: string | null;
};
type Catalogo = {
  nombre: string;
  logo: string | null;
  telefono: string | null;
  color: string;
  productos: Producto[];
};

const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const dinero = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export default function CatalogoPublicoPage() {
  const { slug } = useParams<{ slug: string }>();
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [categoria, setCategoria] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    setCargando(true);
    fetch(`${base}/catalogo-publico/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || "No se pudo cargar el catálogo");
        return d;
      })
      .then((d) => { setCatalogo(d); document.title = `${d.nombre} · Catálogo`; })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [slug]);

  if (cargando) {
    return <main className="catalogo"><div className="catalogo-status">Cargando catálogo…</div></main>;
  }
  if (!catalogo) {
    return (
      <main className="catalogo">
        <div className="catalogo-status">
          <h1>Catálogo no disponible</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  const cats = ["Todos", ...Array.from(new Set(catalogo.productos.map((p) => p.categoria).filter(Boolean) as string[]))];
  const visibles = catalogo.productos.filter(
    (p) =>
      (categoria === "Todos" || p.categoria === categoria) &&
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  return (
    <main className={`catalogo${slug === "enchilamarketpereira" ? " catalogo-enchila" : ""}`} style={{ "--catalogo-color": catalogo.color } as CSSProperties}>
      <header className="catalogo-header">
        <div className="catalogo-marca">
          {catalogo.logo ? (
            <img src={catalogo.logo} alt={catalogo.nombre} />
          ) : (
            <span className="catalogo-monograma">{catalogo.nombre.slice(0, 1)}</span>
          )}
          <div>
            <strong>{catalogo.nombre}</strong>
            <small>Catálogo de productos</small>
          </div>
        </div>
        <a className="catalogo-descargar" href={`${base}/catalogo-publico/${encodeURIComponent(slug)}/pdf`}>
          <Download size={16} /> Descargar PDF
        </a>
      </header>

      <div className="catalogo-filtros">
        <div className="catalogo-categorias">
          {cats.map((c) => (
            <button key={c} aria-pressed={categoria === c} onClick={() => setCategoria(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="catalogo-buscar">
          <Search size={16} />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto..." />
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="catalogo-vacio">
          <PackageSearch size={22} />
          {catalogo.productos.length === 0 ? "Este catálogo aún no tiene productos." : "No hay productos que coincidan."}
        </p>
      ) : (
        <div className="catalogo-grid">
          {visibles.map((p) => (
            <article className="catalogo-producto" key={p.id}>
              {p.imagen ? (
                <img loading="lazy" decoding="async" src={slug === "enchilamarketpereira" ? p.imagen.replace(/^https:\/\/app\.powerpospioneers\.com(?=\/catalogo-imagenes\/)/, "") : p.imagen} alt={p.nombre} />
              ) : (
                <div className="catalogo-producto-placeholder">
                  {p.categoria && <span>{p.categoria}</span>}
                  <strong>{p.nombre}</strong>
                </div>
              )}
              <div>
                {p.categoria && <small>{p.categoria}</small>}
                <h3>{p.nombre}</h3>
                {p.presentacion && <span className="catalogo-presentacion">{p.presentacion}</span>}
                {p.descripcion && <p>{p.descripcion}</p>}
                {p.precio && <strong className="catalogo-precio">{dinero(Number(p.precio))}</strong>}
              </div>
            </article>
          ))}
        </div>
      )}

      <footer className="catalogo-footer">
        <strong>{catalogo.nombre}</strong>
        {catalogo.telefono && <span>{catalogo.telefono}</span>}
        {slug === "enchilamarketpereira" && <small>Imágenes de referencia. Consulta el tamaño o contenido indicado en cada presentación.</small>}
        <small>Catálogo generado con PowerPOS</small>
      </footer>
    </main>
  );
}
