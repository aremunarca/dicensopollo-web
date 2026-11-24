// Utilidades de texto sin dependencias (se usan en el servidor, en el navegador y en los scripts).

/** Minúsculas y sin acentos, para buscar y comparar. */
export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** "Pollo Asado (Entero)" → "pollo-asado-entero" */
export const slugify = (s: string) =>
  norm(s).replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Código de variante a partir del producto y la opción: POLLO-ASADO-ENTERO (máx. 40). */
export function codigoDe(producto: string, opcion?: string | null) {
  const base = slugify(producto).toUpperCase();
  const op = opcion ? slugify(opcion).toUpperCase() : '';
  const max = 40;
  if (!op) return base.slice(0, max);
  const recorte = base.slice(0, Math.max(8, max - op.length - 1)).replace(/-+$/, '');
  return `${recorte}-${op}`.slice(0, max).replace(/-+$/, '');
}

/** Primera letra en mayúscula: "carne mechada" → "Carne mechada" */
export const capital = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('es') + s.slice(1) : s);
