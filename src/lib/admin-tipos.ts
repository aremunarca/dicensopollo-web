// Tipos y textos del panel /admin. Se usan en el servidor y en el navegador (sin dependencias de servidor).

export type Rol = 'GERENTE' | 'LOGISTICA';
export const ROLES: readonly Rol[] = ['GERENTE', 'LOGISTICA'];
export const ROL_TEXTO: Record<Rol, string> = { GERENTE: 'Gerente', LOGISTICA: 'Despacho' };

/** Secciones del panel /admin (?vista=…). */
export type Vista = 'estadisticas' | 'pedidos' | 'productos' | 'carga' | 'usuarios';
/** Vistas que puede abrir cada rol (la primera es la de inicio). */
export function vistasDe(rol: Rol): Vista[] {
  return rol === 'GERENTE' ? ['pedidos', 'estadisticas', 'productos', 'carga', 'usuarios'] : ['pedidos', 'productos', 'carga'];
}

export type UsuarioSesion = { id: number; nombre: string; usuario: string; rol: Rol };

export type UsuarioPanel = UsuarioSesion & { activo: boolean; ultimoAcceso: string | null; createdAt: string };

/* ---------- Pedidos ---------- */

export type EstadoPedido = 'PENDIENTE' | 'CONFIRMADO' | 'ENTREGADO' | 'CANCELADO';
export const ESTADOS: readonly EstadoPedido[] = ['PENDIENTE', 'CONFIRMADO', 'ENTREGADO', 'CANCELADO'];
export const ESTADO_TEXTO: Record<EstadoPedido, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADO: 'En preparación',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};
export const ESTADO_PLURAL: Record<EstadoPedido, string> = {
  PENDIENTE: 'Pendientes',
  CONFIRMADO: 'En preparación',
  ENTREGADO: 'Entregados',
  CANCELADO: 'Cancelados',
};
/** A qué estados puede pasar cada pedido. */
export const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  PENDIENTE: ['CONFIRMADO', 'CANCELADO'],
  CONFIRMADO: ['ENTREGADO', 'PENDIENTE', 'CANCELADO'],
  ENTREGADO: [],
  CANCELADO: ['PENDIENTE'],
};
/** Estados que cuentan como venta. */
export const ESTADOS_VENTA: readonly EstadoPedido[] = ['CONFIRMADO', 'ENTREGADO'];
export const COMENTARIO_MAX = 500;

/** N° visible del pedido: 123 → DC-000123 */
export const numeroPedido = (id: number) => `DC-${String(id).padStart(6, '0')}`;
/** "123", "DC-000123" o "dc000123" → 123 */
export function leerIdPedido(texto: string): number | null {
  const m = decodeURIComponent(texto).trim().match(/^(?:DC-?)?0*(\d{1,10})$/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export type PedidoResumen = {
  id: number;
  numero: string;
  estado: EstadoPedido;
  nombre: string;
  telefono: string;
  entrega: string;
  comuna: string;
  pago: string;
  unidades: number;
  total: number;
  createdAt: string;
};

export type PedidoDetalle = PedidoResumen & {
  direccion: string;
  notas: string;
  items: { varianteId: number | null; codigo: string; nombre: string; cantidad: number; precio: number; img: string | null }[];
  eventos: { id: number; estado: EstadoPedido | null; comentario: string; autor: string; createdAt: string }[];
};

export type ListaPedidos = { pedidos: PedidoResumen[]; conteos: Record<EstadoPedido, number> };

/* ---------- Estadísticas ---------- */

export type Estadisticas = {
  desde: string;
  hasta: string;
  ventas: number;
  ingresos: number;
  ticketPromedio: number;
  unidades: number;
  porEstado: Record<EstadoPedido, number>;
  porEntrega: { entrega: string; pedidos: number; ingresos: number }[];
  porDia: { fecha: string; ingresos: number; pedidos: number }[];
  /** Pedidos vendidos por hora del día (0–23). */
  porHora: { hora: number; pedidos: number }[];
  topProductos: { codigo: string; nombre: string; cantidad: number; ingresos: number }[];
  porCategoria: { categoria: string; cantidad: number; ingresos: number }[];
  topComunas: { comuna: string; pedidos: number; ingresos: number }[];
  carta: { productos: number; productosActivos: number; agotados: number; opciones: number; sinFoto: number };
};

/* ---------- Carta (productos y opciones) ---------- */

export type VarianteAdmin = { id: number; codigo: string; nombre: string | null; detalle: string | null; precio: number; activo: boolean };
export type ProductoAdmin = {
  id: number; slug: string; nombre: string; descripcion: string; categoria: string; img: string; opcion: string;
  destacado: boolean; agotado: boolean; activo: boolean; orden: number; variantes: VarianteAdmin[];
};

/** Cuerpo para crear o editar un producto (PATCH acepta cualquier subconjunto). */
export type VarianteEntrada = { id?: number; codigo?: string; nombre?: string | null; detalle?: string | null; precio?: number | string; activo?: boolean };
export type ProductoEntrada = {
  nombre?: string; descripcion?: string; categoria?: string; img?: string; opcion?: string;
  destacado?: boolean; agotado?: boolean; activo?: boolean; variantes?: VarianteEntrada[];
};

/** Un producto se ve en la carta si está activo y tiene al menos una opción activa. */
export const enCarta = (p: Pick<ProductoAdmin, 'activo' | 'variantes'>) => p.activo && p.variantes.some((v) => v.activo);

/* ---------- Carga masiva ---------- */

export type ModoCarga = 'upsert' | 'crear' | 'actualizar';
export type AccionFila = 'crear' | 'actualizar' | 'sin cambios' | 'error';
export type FilaCarga = {
  fila: number;
  codigo: string;
  nombre: string;
  accion: AccionFila;
  error?: string;
  cambios: { campo: string; antes: string; despues: string }[];
};
export type VistaPreviaCarga = {
  token: string;
  archivo: string;
  resumen: { filas: number; nuevos: number; actualizar: number; sinCambios: number; errores: number };
  filas: FilaCarga[];
  categoriasNuevas: string[];
  columnasIgnoradas: string[];
  /** Se omitió la fila de ejemplo de la plantilla. */
  ejemploIgnorado: boolean;
};
export type ResultadoCarga = { creados: number; actualizados: number; sinCambios: number; errores: number; categoriasNuevas: string[] };
