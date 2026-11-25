import {MapPin,Navigation,ExternalLink} from "lucide-react";
import {enlacesMapaEmpresa} from "../lib/mapaEmpresa";
export default function MapaEmpresa({nombre,direccion}:{nombre:string;direccion?:string|null}) {
 const enlaces=enlacesMapaEmpresa(direccion);
 if(!enlaces) return null;
 return <section className="store-map" id="ubicacion" aria-label={`Ubicación de ${nombre}`}>
  <div className="store-map-heading"><div><div className="eyebrow"><MapPin size={16}/> Estamos cerca</div><h2>Encuéntranos <em>aquí.</em></h2><p>{direccion}</p></div>
   <a className="button primary" href={enlaces.comoLlegar} target="_blank" rel="noopener noreferrer"><Navigation size={18}/> Cómo llegar</a>
  </div>
  <div className="store-map-frame"><iframe key={enlaces.incrustado} title={`Mapa de ${nombre}: ${direccion}`} src={enlaces.incrustado} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
  <div className="store-map-footer"><p>Ubicación según la dirección registrada por la empresa.</p><a href={enlaces.buscar} target="_blank" rel="noopener noreferrer">Abrir en Google Maps <ExternalLink size={15}/></a></div>
 </section>;
}
