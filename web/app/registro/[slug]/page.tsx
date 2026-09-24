"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { User, Phone, IdCard, Mail, MapPin, Cake, CheckCircle2, AlertCircle } from "lucide-react";

const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
async function request(path: string, options?: RequestInit) {
  const r = await fetch(base + path, {
    ...options,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
  });
  const d = await r.json();
  if (!r.ok)
    throw Error(
      Array.isArray(d.message) ? d.message.join(", ") : d.message || "No se pudo completar la solicitud",
    );
  return d;
}

export default function RegistroClientePage() {
  const { slug } = useParams<{ slug: string }>();
  const [empresa, setEmpresa] = useState<{ nombre: string; logo: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [form, setForm] = useState({
    nombre: "", telefono: "", documento: "", email: "", direccion: "", fechaNacimiento: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState<string | null>(null);

  useEffect(() => {
    request(`/registro-clientes/${encodeURIComponent(slug)}`)
      .then(setEmpresa)
      .catch((e) => setErrorCarga(e.message))
      .finally(() => setCargando(false));
  }, [slug]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const d = await request(`/registro-clientes/${encodeURIComponent(slug)}`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setListo(d.nombre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar el registro");
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-orange-500 text-xl font-bold animate-pulse">
          Power<span className="text-white">POS</span>
        </div>
      </div>
    );
  }

  if (!empresa) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <h1 className="text-white text-xl font-bold mb-2">Registro no disponible</h1>
          <p className="text-gray-400 text-sm">{errorCarga}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md fade-in-up">
        <div className="text-center mb-8">
          {empresa.logo ? (
            <img src={empresa.logo} alt={empresa.nombre} className="w-16 h-16 object-contain mx-auto mb-3 rounded-xl" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-orange-500/10 border border-orange-500/30 grid place-items-center mx-auto mb-3 text-2xl font-black text-orange-400">
              {empresa.nombre.slice(0, 1)}
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{empresa.nombre}</h1>
          <p className="text-gray-400 mt-1">Regístrate y no te pierdas nuestras novedades</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800">
          {listo ? (
            <div className="text-center py-6">
              <CheckCircle2 className="mx-auto text-green-400 mb-4" size={48} />
              <h2 className="text-white text-xl font-bold mb-2">¡Gracias, {listo}!</h2>
              <p className="text-gray-400">Ya quedaste registrado. Puedes cerrar esta página.</p>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg p-3 text-sm flex items-center gap-2">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  {error}
                </div>
              )}
              <Campo icon={User} label="Nombre completo" required>
                <input
                  required
                  maxLength={150}
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className={campoInput}
                  placeholder="Tu nombre completo"
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo icon={Phone} label="Teléfono">
                  <input
                    maxLength={30}
                    value={form.telefono}
                    onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    className={campoInput}
                    placeholder="300 123 4567"
                  />
                </Campo>
                <Campo icon={IdCard} label="Documento">
                  <input
                    maxLength={30}
                    value={form.documento}
                    onChange={(e) => setForm({ ...form, documento: e.target.value })}
                    className={campoInput}
                    placeholder="Cédula"
                  />
                </Campo>
              </div>
              <Campo icon={Mail} label="Correo (opcional)">
                <input
                  type="email"
                  maxLength={150}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={campoInput}
                  placeholder="correo@email.com"
                />
              </Campo>
              <Campo icon={MapPin} label="Dirección (opcional)">
                <input
                  maxLength={300}
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  className={campoInput}
                  placeholder="Dirección de residencia"
                />
              </Campo>
              <Campo icon={Cake} label="Fecha de nacimiento (opcional)">
                <input
                  type="date"
                  value={form.fechaNacimiento}
                  onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
                  className={campoInput}
                />
              </Campo>
              <button
                type="submit"
                disabled={enviando}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white font-semibold rounded-lg px-4 py-3.5 transition-all shadow-lg shadow-orange-500/25 mt-2"
              >
                {enviando ? "Enviando..." : "Registrarme"}
              </button>
              <p className="text-center text-xs text-gray-500 pt-1">
                Autorizo a {empresa.nombre} a usar estos datos para atenderme y contactarme.
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">Tienda conectada con PowerPOS</p>
      </div>
    </div>
  );
}

const campoInput =
  "w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors";

function Campo({
  icon: Icon,
  label,
  required,
  children,
}: {
  icon: any;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">
        {label}
        {required && <span className="text-orange-500"> *</span>}
      </label>
      <div className="relative">
        <Icon size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
        {children}
      </div>
    </div>
  );
}
