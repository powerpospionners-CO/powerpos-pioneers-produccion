export function enlacesMapaEmpresa(direccion?: string | null) {
 const destino = direccion?.trim();
 if (!destino) return null;
 const consulta = new URLSearchParams({api:"1",query:destino});
 const ruta = new URLSearchParams({api:"1",destination:destino});
 const mapa = new URLSearchParams({q:destino,output:"embed",hl:"es"});
 return {buscar:`https://www.google.com/maps/search/?${consulta}`,comoLlegar:`https://www.google.com/maps/dir/?${ruta}`,incrustado:`https://www.google.com/maps?${mapa}`};
}
