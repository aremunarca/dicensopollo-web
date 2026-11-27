// Datos del local y tipos de la carta. Se usa en el servidor y en el navegador.

export const CONFIG = {
  nombre: 'Di Censo Pollo',
  lema: 'El más rico, el más sabroso',
  whatsapp: '56929163138', // número que recibe los pedidos (sin + ni espacios)
  telefonoVisible: '+56 9 2916 3138',
  direccion: 'Av. Aviador Bleriot 2241',
  comuna: 'Quinta Normal',
  region: 'Región Metropolitana, Chile',
  instagram: 'https://www.instagram.com/dicensopollo/',
  facebook: 'https://www.facebook.com/share/1LbLf4PuH9/',
  /** Formas de entrega del formulario del pedido. */
  entregas: ['Delivery', 'Retiro en el local'],
  /** Formas de pago que se ofrecen (ajústalas a lo que acepta el local). */
  pagos: ['Efectivo', 'Transferencia', 'Tarjeta'],
} as const;

export type Entrega = (typeof CONFIG.entregas)[number];

export const DIRECCION_COMPLETA = `${CONFIG.direccion}, ${CONFIG.comuna}, ${CONFIG.region}`;
export const MAPA_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(`${CONFIG.direccion}, ${CONFIG.comuna}, Chile`)}&output=embed`;
export const MAPA_LINK = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${CONFIG.nombre}, ${CONFIG.direccion}, ${CONFIG.comuna}`)}`;

export const WA_DEFAULT = '¡Hola Di Censo Pollo! Quiero hacer un pedido 🍗';
export const linkWa = (txt: string, telefono: string = CONFIG.whatsapp) => 'https://wa.me/' + telefono + '?text=' + encodeURIComponent(txt);

/** Pesos chilenos: 14000 → "$14.000" */
export const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');

/** Una opción con precio de un producto (fila de `variantes`). */
export type Opcion = {
  id: number;
  codigo: string;
  /** "Entero"; null = opción única. */
  nombre: string | null;
  detalle: string | null;
  precio: number;
};

/** Un producto de la carta con sus opciones activas, de menor a mayor precio. */
export type ProductoCarta = {
  id: number;
  slug: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  img: string;
  /** Título del selector ("Tamaño"); vacío si hay una sola opción. */
  opcion: string;
  destacado: boolean;
  agotado: boolean;
  opciones: Opcion[];
};

/** Nombre de una línea del pedido: "Pollo Asado (Entero)" */
export const nombreLinea = (producto: string, opcion: string | null) => (opcion ? `${producto} (${opcion})` : producto);

export type DatosCliente = {
  nombre: string;
  telefono: string;
  entrega: string;
  comuna?: string;
  direccion?: string;
  pago: string;
  notas?: string;
};

export const esDelivery = (entrega: string) => entrega === 'Delivery';
