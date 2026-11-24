"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {Clock3, CalendarDays, ArrowUpRight} from "lucide-react";
import {diasHorario,estadoHorario,horarioValido,horaVisible,type HorarioPublico} from "../lib/horarioTienda";
export default function HorarioTienda({horarios,anterior,compacto=false,href}: {horarios?:HorarioPublico[]|null;anterior?:string;compacto?:boolean;href?:string}) {
 const [ahora,setAhora]=useState<Date|null>(null);
 useEffect(()=>{const actualizar=()=>setAhora(new Date());actualizar();const timer=setInterval(actualizar,30000);window.addEventListener("focus",actualizar);return()=>{clearInterval(timer);window.removeEventListener("focus",actualizar);};},[]);
 const validos=horarioValido(horarios);
 if(!validos&&!anterior?.trim()) return null;
 const estado=validos&&ahora?estadoHorario(horarios,ahora):null;
 const insignia=<b className={`hours-status ${estado?estado.abierto?"is-open":"is-closed":""}`}><i aria-hidden="true"/>{estado?estado.abierto?"Abierto ahora":"Cerrado ahora":"Horario de atención"}</b>;
 if(compacto) return <div className="hours-compact">{insignia}{estado&&<small>{estado.detalle}</small>}{href&&<Link href={href} prefetch={false} aria-label="Consultar horario semanal">Ver horarios <ArrowUpRight size={13}/></Link>}</div>;
 return <section className="hours-card" aria-label="Horario de atención">
  <div className="hours-intro"><div className="hours-icon"><Clock3 size={28}/></div><div className="eyebrow">Visítanos</div><h2>Siempre hay un buen momento <em>para encontrarnos.</em></h2><div aria-live="polite">{insignia}{estado&&<p className="hours-next">{estado.detalle}</p>}</div><p className="hours-timezone"><CalendarDays size={16}/> Hora de Colombia · UTC−5</p></div>
  <div className="hours-week">{validos?<><ul>{diasHorario.map((nombre,dia)=>{const h=horarios.find(v=>v.dia===dia)!;return <li key={dia} className={estado?.dia===dia?"is-today":""}><div><strong>{nombre}</strong>{estado?.dia===dia&&<span className="hours-today">Hoy</span>}</div><div className={h.abierto?"hours-range":"hours-day-off"}>{h.abierto?<><time dateTime={h.apertura}>{horaVisible(h.apertura)}</time><span aria-hidden="true">—</span><time dateTime={h.cierre}>{horaVisible(h.cierre)}</time>{h.cierre<h.apertura&&<small>cierra al día siguiente</small>}</>:"Cerrado"}</div></li>;})}</ul><p className="hours-note">Horario habitual. En festivos puede variar; confirma con el negocio.</p></>:<p className="hours-legacy">{anterior}</p>}</div>
 </section>;
}
