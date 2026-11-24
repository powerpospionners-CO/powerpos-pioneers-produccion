"use client";
import Image from "next/image";
import api from "@/lib/api";
type Foto = {imagen: string; descripcion: string};
type Pregunta = {pregunta: string; respuesta: string};
const input = "mt-2 w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white";
const boton = "rounded-lg border border-gray-600 px-4 py-2 disabled:opacity-50";
export default function ContenidoWeb({galeria, preguntas, busy, onChange, onBusy, onMensaje, onError}: {
 galeria: Foto[]; preguntas: Pregunta[]; busy: boolean;
 onChange: (campo: string, valor: unknown) => void; onBusy: (valor: boolean) => void; onMensaje: (valor: string) => void; onError: (valor: string) => void;
}) {
 async function subir(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]; if (!file) return;
  onBusy(true); onError(""); onMensaje("Subiendo foto de la galería…");
  try {
   const form = new FormData(); form.append("imagen", file);
   const {data} = await api.post("/empresa/anuncios/imagen",form,{headers:{"Content-Type":"multipart/form-data"}});
   onChange("galeria", [...galeria,{imagen:data.imagen,descripcion:""}]);
   onMensaje("Foto cargada. Guarda los cambios para publicarla.");
  } catch (error: any) { onMensaje(""); onError(error.response?.data?.message || "No se pudo subir la foto"); }
  finally {onBusy(false); e.target.value="";}
 }
 return <>
  <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4">
   <h2 className="text-xl font-bold">Fotos del local y del equipo</h2>
   <p className="text-gray-400">Se muestran en Nosotros. Puedes agregar hasta 12 fotos con una descripción. Guarda los cambios para publicarlas.</p>
   <label className="block">Agregar foto<input className={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || galeria.length>=12} onChange={subir}/></label>
   <div className="grid gap-4 sm:grid-cols-2">{galeria.map((foto,i)=><div key={foto.imagen+i} className="space-y-3 rounded-lg border border-gray-700 p-4">
    <Image src={foto.imagen} alt={foto.descripcion || `Foto ${i+1}`} width={400} height={260} unoptimized className="h-44 w-full rounded-lg object-contain"/>
    <label className="block">Descripción de la foto {i+1}<input maxLength={200} disabled={busy} className={input} value={foto.descripcion} onChange={e=>onChange("galeria",galeria.map((f,n)=>n===i?{...f,descripcion:e.target.value}:f))}/></label>
    <button type="button" disabled={busy} className={boton} onClick={()=>onChange("galeria",galeria.filter((_,n)=>n!==i))}>Quitar foto</button>
   </div>)}</div>
  </section>
  <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 space-y-4">
   <h2 className="text-xl font-bold">Preguntas frecuentes</h2>
   <p className="text-gray-400">Se muestran en Contacto. Responde dudas sobre compras, entregas, productos o atención de tu empresa.</p>
   {preguntas.map((p,i)=><div key={i} className="space-y-3 rounded-lg border border-gray-700 p-4">
    <label className="block">Pregunta {i+1}<input required disabled={busy} maxLength={200} className={input} value={p.pregunta} onChange={e=>onChange("preguntasFrecuentes",preguntas.map((v,n)=>n===i?{...v,pregunta:e.target.value}:v))}/></label>
    <label className="block">Respuesta {i+1}<textarea required disabled={busy} maxLength={2000} rows={3} className={input} value={p.respuesta} onChange={e=>onChange("preguntasFrecuentes",preguntas.map((v,n)=>n===i?{...v,respuesta:e.target.value}:v))}/></label>
    <button type="button" disabled={busy} className={boton} onClick={()=>onChange("preguntasFrecuentes",preguntas.filter((_,n)=>n!==i))}>Quitar pregunta</button>
   </div>)}
   <button type="button" disabled={busy || preguntas.length>=20} className={boton} onClick={()=>onChange("preguntasFrecuentes",[...preguntas,{pregunta:"",respuesta:""}])}>Agregar pregunta</button>
  </section>
 </>;
}
