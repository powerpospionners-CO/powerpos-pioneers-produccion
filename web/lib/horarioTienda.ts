export type HorarioPublico = { dia: number; abierto: boolean; apertura: string; cierre: string };
export const diasHorario = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export function horaVisible(hora: string) {
 const [h,m] = hora.split(":"); const n = Number(h);
 return `${n % 12 || 12}:${m} ${n < 12 ? "a. m." : "p. m."}`;
}
const minutos = (h: string) => Number(h.slice(0,2))*60+Number(h.slice(3));
export function horarioValido(h?: HorarioPublico[] | null): h is HorarioPublico[] {
 return Array.isArray(h) && h.length===7 && new Set(h.map(v=>v.dia)).size===7 && h.every(v=>Number.isInteger(v.dia)&&v.dia>=0&&v.dia<7&&typeof v.abierto==='boolean'&&(!v.abierto || ([v.apertura,v.cierre].every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t))&&v.apertura!==v.cierre)));
}
export function estadoHorario(horarios: HorarioPublico[], ahora: Date) {
 const partes = new Intl.DateTimeFormat("en-US",{timeZone:"America/Bogota",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(ahora);
 const parte=(tipo:string)=>partes.find(p=>p.type===tipo)?.value || "";
 const dia=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].indexOf(parte("weekday"));
 const minuto=Number(parte("hour"))*60+Number(parte("minute"));
 const hoy=horarios.find(h=>h.dia===dia)!;
 const anterior=horarios.find(h=>h.dia===(dia+6)%7)!;
 if(anterior.abierto && anterior.cierre<anterior.apertura && minuto<minutos(anterior.cierre)) return {dia,abierto:true,detalle:`Cierra hoy a las ${horaVisible(anterior.cierre)}`};
 if(hoy.abierto && minuto>=minutos(hoy.apertura) && (hoy.cierre<hoy.apertura || minuto<minutos(hoy.cierre))) return {dia,abierto:true,detalle:`Cierra ${hoy.cierre<hoy.apertura?"mañana ":""}a las ${horaVisible(hoy.cierre)}`};
 for(let n=0;n<=7;n++) {
  const siguiente=horarios.find(h=>h.dia===(dia+n)%7)!;
  if(siguiente.abierto && (n>0 || minuto<minutos(siguiente.apertura))) return {dia,abierto:false,detalle:`Abre ${n===0?"hoy":n===1?"mañana":`el ${diasHorario[siguiente.dia].toLocaleLowerCase('es')}`} a las ${horaVisible(siguiente.apertura)}`};
 }
 return {dia,abierto:false,detalle:"Sin días de atención programados"};
}
