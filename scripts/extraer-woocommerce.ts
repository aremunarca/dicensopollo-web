// Extrae la carta del sitio actual (WordPress + WooCommerce) y genera los datos del seed.
//
//   npm run catalogo:extraer
//
// 1. Lee los productos de la API pública de WooCommerce (/wp-json/wc/store/v1/products).
// 2. Entra a cada producto y a cada una de sus variaciones para tomar las opciones y su precio.
// 3. Descarga la foto de cada producto a public/productos/.
// 4. Escribe prisma/seed-data/carta.json (lo usa `npm run db:seed`).
//
// WooCommerce no tiene categorías ni códigos cargados: la categoría, el orden, los nombres corregidos
// y las descripciones limpias se definen abajo en CARTA (clave = slug del producto en WooCommerce).
// Si aparece un producto nuevo en el sitio, el script avisa y lo agrega en "Otros" con sus datos tal cual.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { capital, codigoDe, slugify } from '../src/lib/texto';

const SITIO = 'https://dicensopollo.com';
const API = `${SITIO}/wp-json/wc/store/v1/products`;
const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_FOTOS = path.join(RAIZ, 'public', 'productos');
const SALIDA = path.join(RAIZ, 'prisma', 'seed-data', 'carta.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; catalogo-dicenso/1.0)' };

type WooImagen = { src: string; srcset: string };
type WooAtributo = { name: string; terms: { name: string; slug: string }[] };
type WooProducto = {
  id: number; name: string; slug: string; type: string; permalink: string; description: string;
  prices: { price: string; currency_code: string };
  images: WooImagen[];
  attributes: WooAtributo[];
  variations: { id: number; attributes: { name: string; value: string }[] }[];
  is_purchasable: boolean; is_in_stock: boolean;
};

/* ---------- Curaduría (lo que WooCommerce no tiene) ---------- */

const CATEGORIAS = ['Pollos y promos', 'Comida venezolana', 'Sándwiches y completos', 'Platos y colaciones', 'Acompañamientos'] as const;
type Cat = (typeof CATEGORIAS)[number] | 'Otros';

type Curado = {
  categoria: Cat;
  nombre?: string;
  /** Descripción limpia (basada en el texto del sitio). Vacía si el texto solo repetía las opciones. */
  descripcion: string;
  /** Título del selector de opciones. */
  opcion?: string;
  destacado?: boolean;
  /** Nombre de cada opción a partir de los valores de sus atributos. */
  etiqueta?: (valores: Record<string, string>) => string;
  /** Qué incluye cada opción (por nombre de opción). */
  detalles?: Record<string, string>;
};

const CARTA: Record<string, Curado> = {
  'di-censo-pollo': {
    categoria: 'Pollos y promos', destacado: true,
    descripcion: '1 pollo asado, papas fritas grandes, 1 ensalada, 4 salsas (ajo, guasacaca, rocoto) y 1 Coca-Cola de 1,5 L.',
  },
  pollo: {
    categoria: 'Pollos y promos', nombre: 'Pollo Asado', opcion: 'Tamaño', destacado: true,
    // Texto de la portada del sitio
    descripcion: 'Aderezado y macerado con ricas especias: piel dorada y carne increíblemente jugosa.',
  },
  'promo-1': {
    categoria: 'Pollos y promos', nombre: 'Promos', opcion: 'Promo', destacado: true, descripcion: '',
    etiqueta: (v) => `Promo ${Object.values(v)[0]}`,
    // El sitio solo describe la promo 1 (la descripción del producto). Completa las demás desde el panel.
    detalles: { 'Promo 1': '1/4 de pollo, papas fritas y 1 salsa' },
  },
  arepas: { categoria: 'Comida venezolana', opcion: 'Relleno', destacado: true, descripcion: '' },
  cachapas: { categoria: 'Comida venezolana', descripcion: 'Con queso de mano.' },
  empandas: { categoria: 'Comida venezolana', nombre: 'Empanadas', opcion: 'Relleno', descripcion: '' },
  'pabellon-venezolano': { categoria: 'Comida venezolana', descripcion: 'Arroz, caraota, carne mechada, tajadas y huevo.' },
  hamburguesa: { categoria: 'Sándwiches y completos', descripcion: 'Pan, lechuga, tomate, papas al hilo, jamón, queso, carne y salsas.' },
  sanwiches: { categoria: 'Sándwiches y completos', nombre: 'Sándwiches', opcion: 'Tipo', descripcion: '' },
  completos: {
    categoria: 'Sándwiches y completos', opcion: 'Tipo', descripcion: '',
    // Atributos "Cantidad" y "Puede pedir:" → "Italiano", "Italiano × 2"
    etiqueta: (v) => {
      const cant = Number(v['Cantidad'] ?? 1);
      const tipo = Object.entries(v).find(([k]) => k !== 'Cantidad')?.[1] ?? '';
      return capital(tipo) + (cant > 1 ? ` × ${cant}` : '');
    },
  },
  colaciones: {
    categoria: 'Platos y colaciones',
    descripcion: 'Bistec, chuleta de cerdo o chuleta ahumada. Acompañamiento: arroz, ensalada o papas fritas.',
  },
  pasticho: { categoria: 'Platos y colaciones', nombre: 'Lasaña – Pasticho', descripcion: 'Con carne, crema bechamel, jamón y queso.' },
  'arroz-chino': {
    categoria: 'Platos y colaciones',
    // Texto de la portada del sitio
    descripcion: 'Arroz frito con brotes de soja, cebollín, trozos de pollo, jamón y chuleta ahumada.',
  },
  papas: {
    categoria: 'Acompañamientos', nombre: 'Papas Fritas', opcion: 'Tamaño',
    // Texto de la portada del sitio
    descripcion: 'Cortadas a medida, gruesas y en porciones generosas: doradas y crujientes por fuera, suaves por dentro.',
  },
  salchipapas: { categoria: 'Acompañamientos', opcion: 'Tamaño', descripcion: '' },
  nuggets: { categoria: 'Acompañamientos', descripcion: '6 piezas de nuggets + 1/4 de papas fritas.' },
  ensaladas: { categoria: 'Acompañamientos', descripcion: 'Lechuga, tomate, repollo, zanahoria, pepino, betarraga y más…' },
  sopaipilla: {
    categoria: 'Acompañamientos', nombre: 'Sopaipillas', opcion: 'Cantidad', descripcion: '',
    etiqueta: (v) => { const n = Number(Object.values(v)[0]); return `${n} ${n === 1 ? 'unidad' : 'unidades'}`; },
  },
};

/* ---------- Utilidades ---------- */

const ENTIDADES: Record<string, string> = { amp: '&', nbsp: ' ', quot: '"', lt: '<', gt: '>', ldquo: '“', rdquo: '”', hellip: '…', ndash: '–', mdash: '—' };
const decodificar = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
const textoPlano = (html: string) =>
  decodificar(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ''))
    .split('\n').map((l) => l.trim()).filter(Boolean).join(' / ');

async function pedirJson<T>(url: string): Promise<T> {
  for (let intento = 1; ; intento++) {
    const res = await fetch(url, { headers: UA }).catch(() => null);
    if (res?.ok) return (await res.json()) as T;
    if (intento >= 3) throw new Error(`No se pudo leer ${url} (${res?.status ?? 'sin conexión'})`);
    await new Promise((r) => setTimeout(r, 800 * intento));
  }
}

/** Mejor tamaño de la foto para la carta: ~768 px (WooCommerce genera varios tamaños). */
function urlFoto(img: WooImagen | undefined): string | null {
  if (!img) return null;
  const opciones = img.srcset.split(',').map((s) => s.trim().split(/\s+/)).map(([url, w]) => ({ url, w: parseInt(w, 10) }))
    .filter((o) => o.url && Number.isFinite(o.w));
  const ideal = opciones.filter((o) => o.w >= 600 && o.w <= 1024).sort((a, b) => Math.abs(a.w - 768) - Math.abs(b.w - 768))[0];
  return ideal?.url ?? img.src;
}

/** Descarga la foto y la guarda cuadrada en WebP de 800 px (las del sitio pesan hasta 900 KB en PNG). */
async function descargarFoto(url: string, nombre: string): Promise<string> {
  const archivo = `${nombre}.webp`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`No se pudo descargar la foto ${url} (${res.status})`);
  await sharp(Buffer.from(await res.arrayBuffer()))
    .rotate()
    .resize(800, 800, { fit: 'cover', position: 'attention', withoutEnlargement: false })
    .webp({ quality: 80 })
    .toFile(path.join(DIR_FOTOS, archivo));
  return `/productos/${archivo}`;
}

/* ---------- Extracción ---------- */

async function main() {
  fs.mkdirSync(DIR_FOTOS, { recursive: true });
  const lista: WooProducto[] = [];
  for (let pagina = 1; ; pagina++) {
    const lote = await pedirJson<WooProducto[]>(`${API}?per_page=100&page=${pagina}`);
    lista.push(...lote);
    if (lote.length < 100) break;
  }
  console.log(`Productos en ${SITIO}: ${lista.length}`);

  type Salida = {
    slug: string; nombre: string; categoria: Cat; descripcion: string; opcion: string; destacado: boolean; img: string;
    wooId: number; url: string; descripcionWeb: string;
    variantes: { codigo: string; nombre: string | null; detalle: string | null; precio: number; wooId: number }[];
  };
  const productos: Salida[] = [];
  const sinCurar: string[] = [];
  for (const resumen of lista) {
    // Se entra a cada producto y a cada variación (allí está el precio de cada opción).
    const p = await pedirJson<WooProducto>(`${API}/${resumen.id}`);
    const cur: Curado = CARTA[p.slug] ?? { categoria: 'Otros', descripcion: textoPlano(p.description) };
    if (!CARTA[p.slug]) sinCurar.push(p.slug);
    const nombre = cur.nombre ?? decodificar(p.name);
    const slug = slugify(nombre);

    const variantes: { codigo: string; nombre: string | null; detalle: string | null; precio: number; wooId: number }[] = [];
    if (p.type === 'variable' && p.variations.length) {
      // Orden de los términos tal como están en el producto (para desempatar precios iguales)
      const ordenTerm = new Map(p.attributes.flatMap((a) => a.terms.map((t, i) => [`${a.name}|${t.slug}`, i] as const)));
      const filas = [];
      for (const v of p.variations) {
        const det = await pedirJson<WooProducto>(`${API}/${v.id}`);
        const valores: Record<string, string> = {};
        for (const a of v.attributes) {
          const attr = p.attributes.find((x) => x.name === a.name);
          valores[a.name] = attr?.terms.find((t) => t.slug === a.value)?.name ?? a.value;
        }
        const etiqueta = cur.etiqueta ? cur.etiqueta(valores) : capital(Object.values(valores).map(capital).join(' · '));
        const orden = v.attributes.reduce((s, a) => s * 10 + (ordenTerm.get(`${a.name}|${a.value}`) ?? 9), 0);
        filas.push({ etiqueta, precio: Number(det.prices.price), wooId: v.id, orden });
      }
      filas.sort((a, b) => a.precio - b.precio || a.orden - b.orden);
      for (const f of filas) {
        variantes.push({ codigo: codigoDe(nombre, f.etiqueta), nombre: f.etiqueta, detalle: cur.detalles?.[f.etiqueta] ?? null, precio: f.precio, wooId: f.wooId });
      }
    } else {
      variantes.push({ codigo: codigoDe(nombre), nombre: null, detalle: null, precio: Number(p.prices.price), wooId: p.id });
    }

    const foto = urlFoto(p.images[0]);
    const img = foto ? await descargarFoto(foto, slug) : '';
    productos.push({
      slug, nombre, categoria: cur.categoria, descripcion: cur.descripcion, opcion: variantes.length > 1 ? (cur.opcion ?? 'Opción') : '',
      destacado: !!cur.destacado, img, wooId: p.id, url: p.permalink, descripcionWeb: textoPlano(p.description), variantes,
    });
    console.log(`  ✓ ${nombre.padEnd(22)} ${variantes.length} opción(es) · ${img || 'sin foto'}`);
  }

  // Orden de la carta: por categoría y luego como está en CARTA
  const claves = Object.keys(CARTA);
  const cats = [...CATEGORIAS, 'Otros'];
  productos.sort((a, b) => cats.indexOf(a.categoria) - cats.indexOf(b.categoria)
    || (claves.indexOf(lista.find((x) => x.id === a.wooId)!.slug) - claves.indexOf(lista.find((x) => x.id === b.wooId)!.slug)));

  const moneda = lista[0]?.prices.currency_code ?? 'CLP';
  const datos = {
    origen: SITIO, extraido: new Date().toISOString(), moneda,
    categorias: cats.filter((c) => productos.some((p) => p.categoria === c)),
    productos,
  };
  fs.writeFileSync(SALIDA, JSON.stringify(datos, null, 2) + '\n');
  const nVar = productos.reduce((s, p) => s + p.variantes.length, 0);
  console.log(`\nListo: ${productos.length} productos, ${nVar} opciones con precio (${moneda}) → ${path.relative(RAIZ, SALIDA)}`);
  if (sinCurar.length) console.warn(`Productos nuevos sin curar (quedaron en "Otros"): ${sinCurar.join(', ')}. Agrégalos a CARTA en este script.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
