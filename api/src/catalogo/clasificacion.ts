// Clasificación automática del catálogo por origen (mexicano/peruano) y por
// uso (restaurantes, tiendas, mayoristas). Son reglas por palabras clave en
// el nombre y la presentación: un producto que no coincide con ninguna regla
// queda sin clasificar, para que el admin lo revise a mano.

export type Origen = 'MEXICANO' | 'PERUANO';
export type Uso = 'RESTAURANTE' | 'TIENDA' | 'SUPERMERCADO' | 'MAYORISTA';

const PALABRAS_PERUANO = [
  'aji', 'ajies', 'panca', 'mirasol', 'rocoto', 'chuno', 'cholpi', 'chulpi', 'maiz morado',
  'huancaina', 'uchucuta', 'tari', 'chicha', 'concentrado', 'huacatay', 'lucuma', 'kiwicha',
  'quinua', 'camote', 'pisco', 'peru', 'peruano', 'peruana', 'fantasia de adobo', 'pimenton',
];

const PALABRAS_MEXICANO = [
  'chile', 'chiles', 'guajillo', 'ancho', 'pasilla', 'morita', 'arbol', 'chipotle', 'tajin',
  'valentina', 'clamato', 'chamoy', 'tamarindo', 'piloncillo', 'maseca', 'tortilla', 'chilerito',
  'clemente jacques', 'la anita', 'habanero', 'jalapeno', 'cholula', 'tabasco', 'mole',
  'epazote', 'pozole', 'totopo', 'mazapan', 'pulparindo', 'pelon', 'vero', 'miguelito', 'lucas',
  'sandibrochas', 'pulparindots', 'bubbaloo', 'banderilla', 'banderillas', 'enchilada', 'enchilado',
  'mexicano', 'mexicana', 'la guerita', 'sabores de mexico', 'pulpa',
];

// Ingredientes y condimentos que se compran para cocinar.
const PALABRAS_RESTAURANTE = [
  'sal', 'pimienta', 'comino', 'oregano', 'laurel', 'achiote', 'ajonjoli', 'curcuma', 'canela',
  'clavo', 'anis', 'hierbas', 'tomillo', 'cilantro', 'ajo', 'cebolla', 'polvo', 'pasta', 'salsa',
  'aceite', 'vinagre', 'mayonesa', 'crema de coco', 'leche de coco', 'ramen', 'fideos', 'arroz',
  'harina', 'almendra', 'nuez', 'pistacho', 'macadamia', 'avellana', 'mani', 'semillas', 'linaza',
  'chia', 'gelatina', 'bicarbonato', 'cacao', 'maiz', 'quinua', 'chile', 'chiles', 'aji', 'panca',
  'guajillo', 'ancho', 'pasilla', 'morita', 'arbol', 'chipotle', 'habanero', 'jalapeno', 'rocoto',
  'mirasol', 'huacatay', 'epazote', 'mole', 'chuno', 'cholpi', 'chulpi', 'tari', 'concentrado',
];

// Dulces, bebidas y snacks de mostrador.
const PALABRAS_TIENDA = [
  'pepas', 'dulce', 'banderilla', 'banderillas', 'pulparindo', 'chamoy', 'goma', 'gomas', 'chocolate',
  'paleta', 'chupeta', 'bebida', 'refresco', 'gaseosa', 'galleta', 'chips', 'papas', 'caramelo',
  'bombon', 'skwinkles', 'skwinkle', 'pelon', 'vero', 'miguelito', 'lucas', 'sandibrochas',
  'pulparindots', 'bubbaloo', 'pintazul', 'risandia', 'pacheta', 'mazapan', 'chupetas',
  'picafresa', 'pulparindin', 'skwincles', 'sobre', 'sobres', 'toston', 'chilpi',
];

function normalizar(texto: string): string {
  return ` ${texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function contiene(textoNormalizado: string, palabras: string[]): boolean {
  return palabras.some((p) => textoNormalizado.includes(` ${p} `));
}

// Cantidad total en gramos/mililitros, para detectar presentaciones grandes
// (de 1 kg o más, o de 1 L o más) que se venden a mayoristas.
function cantidadBase(presentacion: string | null): number {
  if (!presentacion) return 0;
  const match = presentacion.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|l)\b/);
  if (!match) return 0;
  const valor = Number(match[1].replace(',', '.'));
  const unidad = match[2];
  if (unidad === 'kg' || unidad === 'l') return valor * 1000;
  return valor;
}

export function clasificarProducto(nombre: string, presentacion: string | null, categoria: string | null) {
  const texto = normalizar(`${nombre} ${presentacion || ''} ${categoria || ''}`);
  const tienePeruano = contiene(texto, PALABRAS_PERUANO);
  const tieneMexicano = contiene(texto, PALABRAS_MEXICANO);
  const origen: Origen | null = tienePeruano && !tieneMexicano ? 'PERUANO' : tieneMexicano && !tienePeruano ? 'MEXICANO' : null;

  const usos: Uso[] = [];
  if (contiene(texto, PALABRAS_RESTAURANTE)) usos.push('RESTAURANTE');
  if (contiene(texto, PALABRAS_TIENDA)) usos.push('TIENDA');
  if (cantidadBase(presentacion) >= 1000 || /\b(caja|tarro|bolsa)\b.*\b\d{2,}\b/.test(normalizar(`${nombre} ${presentacion || ''}`))) usos.push('MAYORISTA');

  return { origen, usos };
}
