import { TiendaService } from './tienda.service';
import { tiendaConfig } from './reglas';
describe('Contenido web por empresa', () => {
  function servicio() {
    const empresa = { id: 2, tiendaSlug: 'empresa', logo: null, tiendaConfig: {}, fidelizacionConfig: {} };
    const db: any = { empresa: { findUnique: jest.fn().mockResolvedValue(empresa), update: jest.fn().mockResolvedValue(empresa) }, categoria: { count: jest.fn().mockResolvedValue(1) }, producto: { count: jest.fn().mockResolvedValue(0) }, $queryRaw: jest.fn() };
    db.$transaction = async (fn: any) => fn(db);
    return {db, service: new TiendaService(db, {} as any, {} as any)};
  }
  it('guarda misión, visión e imágenes verificando la empresa de cada categoría', async () => {
    const {db, service} = servicio();
    db.categoria.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await service.configurar(2, {tienda:{mision:'Nuestra misión',vision:'Nuestra visión',galeria:[{imagen:'https://example.com/local.png',descripcion:'Local'}],preguntasFrecuentes:[{pregunta:'¿Entregan?',respuesta:'Sí, previa confirmación'}],imagenesCategorias:[{categoriaId:9,imagen:'https://example.com/categoria.png'}]}});
    expect(db.categoria.count).toHaveBeenCalledWith({where:{empresaId:2,id:{in:[9]}}});
    expect(db.empresa.update.mock.calls[0][0].data.tiendaConfig).toMatchObject({mision:'Nuestra misión',vision:'Nuestra visión',galeria:[{imagen:'https://example.com/local.png',descripcion:'Local'}],preguntasFrecuentes:[{pregunta:'¿Entregan?',respuesta:'Sí, previa confirmación'}],imagenesCategorias:[{categoriaId:9,imagen:'https://example.com/categoria.png'}]});
  });
  it('rechaza imágenes de categorías de otra empresa sin guardar', async () => {
    const {db, service} = servicio(); db.categoria.count.mockResolvedValue(0);
    await expect(service.configurar(2,{tienda:{imagenesCategorias:[{categoriaId:99,imagen:'https://example.com/cat.png'}]}})).rejects.toThrow('su empresa');
    expect(db.empresa.update).not.toHaveBeenCalled();
  });
  it.each([{galeria:[{imagen:'http://inseguro.test/foto.png',descripcion:'Local'}]}, {preguntasFrecuentes:[{pregunta:'',respuesta:'Respuesta'}]}])('rechaza contenido incompleto o inseguro', async tienda => {
    const {db, service} = servicio();
    await expect(service.configurar(2,{tienda})).rejects.toThrow();
    expect(db.empresa.update).not.toHaveBeenCalled();
  });
  it('conserva valores vacíos para empresas existentes', () => {
    expect(tiendaConfig({})).toMatchObject({mision:'',vision:'',imagenesCategorias:[]});
  });
});
