import 'server-only';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { prisma } from './prisma';
import { HttpError, leerPesos } from './api';
import { libre } from './catalogo';
import { fotoValida } from './fotos';
import { codigoDe, slugify } from './texto';
import type { AccionFila, FilaCarga, ModoCarga, ResultadoCarga, VistaPreviaCarga } from './admin-tipos';

// Carga masiva de la carta desde Excel (.xlsx) o CSV. Cada fila es una OPCIÓN con precio (Pollo Asado · Entero).
// Las filas con el mismo producto forman una sola tarjeta. Primero se muestra una vista previa; luego se aplica.
// En lo que ya existe, una celda vacía no cambia nada.

export const MAX_BYTES_CARGA = 5 * 1024 * 1024;
const MAX_FILAS = 3000;
const CODIGO_EJEMPLO = 'EJEMPLO-001';

type Campo = 'id' | 'codigo' | 'producto' | 'variante' | 'precio' | 'detalle' | 'categoria' | 'descripcion' | 'selector' | 'activo' | 'agotado' | 'destacado' | 'img';
type Celda = string | number | boolean | Date | null;

const COLUMNAS: { campo: Campo; titulo: string; alias: string[]; ayuda: string }[] = [
  { campo: 'id', titulo: 'id', alias: ['id', 'idinterno'], ayuda: 'Solo en la carta descargada: identifica la opción exacta. Déjalo vacío en filas nuevas.' },
  { campo: 'codigo', titulo: 'codigo', alias: ['codigo', 'sku', 'ref', 'referencia'], ayuda: 'Código de la opción (ej.: POLLO-ASADO-ENTERO). Vacío al crear = se genera solo.' },
  { campo: 'producto', titulo: 'producto', alias: ['producto', 'nombre', 'plato'], ayuda: 'Obligatorio al crear. Nombre de la tarjeta en la carta (ej.: Pollo Asado). Las filas con el mismo producto son opciones de la misma tarjeta.' },
  { campo: 'variante', titulo: 'opcion', alias: ['opcion', 'variante', 'tamano', 'sabor', 'relleno'], ayuda: 'Nombre de la opción (Entero, Medio, Queso…). Vacío = opción única (productos sin opciones).' },
  { campo: 'precio', titulo: 'precio', alias: ['precio', 'valor', 'pesos'], ayuda: 'Precio en pesos, sin decimales (ej.: 14000). Obligatorio al crear.' },
  { campo: 'detalle', titulo: 'detalle', alias: ['detalle', 'incluye'], ayuda: 'Qué incluye la opción (ej.: Promo 1 → 1/4 de pollo, papas fritas y 1 salsa). Opcional.' },
  { campo: 'categoria', titulo: 'categoria', alias: ['categoria', 'seccion'], ayuda: 'Obligatoria al crear. Sección de la carta (hoja Categorias). Si no existe, se crea.' },
  { campo: 'descripcion', titulo: 'descripcion', alias: ['descripcion', 'ingredientes'], ayuda: 'Descripción del producto (ingredientes). Se toma de la primera fila de cada producto.' },
  { campo: 'selector', titulo: 'selector', alias: ['selector', 'titulo', 'tituloopciones'], ayuda: 'Título del selector de opciones (Tamaño, Relleno, Tipo). Vacío con varias opciones = "Opción".' },
  { campo: 'activo', titulo: 'visible', alias: ['visible', 'activo', 'encarta', 'estado'], ayuda: 'SI = la opción se ve en la carta, NO = oculta. Vacío al crear = SI.' },
  { campo: 'agotado', titulo: 'agotado', alias: ['agotado', 'agotadohoy'], ayuda: 'SI = el producto aparece como agotado (no se puede pedir). Vacío al crear = NO.' },
  { campo: 'destacado', titulo: 'destacado', alias: ['destacado', 'favorito'], ayuda: 'SI = el producto aparece en "Los favoritos" de la portada.' },
  { campo: 'img', titulo: 'foto', alias: ['foto', 'img', 'imagen', 'urlfoto'], ayuda: 'Foto del producto (ej.: /productos/pollo-asado.webp o una URL). Para subir fotos nuevas usa "Fotos en lote".' },
];
const ETIQUETA: Record<string, string> = {
  codigo: 'Código', variante: 'Opción', precio: 'Precio', detalle: 'Detalle', activo: 'Visible',
  categoria: 'Categoría', descripcion: 'Descripción', selector: 'Selector', agotado: 'Agotado', destacado: 'Destacado', img: 'Foto',
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_\-.()]/g, '');
const clave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const texto = (v: Celda) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v).trim());
const pesos = (n: number) => '$' + n.toLocaleString('es-CL');
const siNo = (b: boolean) => (b ? 'Sí' : 'No');

/* ---------- Lectura del archivo ---------- */

function valorCelda(v: ExcelJS.CellValue): Celda {
  if (v == null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((p) => p.text).join('');
    if ('result' in v) return valorCelda(v.result as ExcelJS.CellValue);
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('error' in v) return null;
  }
  return String(v);
}

type FilaHoja = { fila: number; celdas: Celda[] };

async function leerXlsx(datos: Uint8Array<ArrayBuffer>): Promise<FilaHoja[]> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos.buffer);
  } catch {
    throw new HttpError(400, 'No se pudo leer el Excel. Guárdalo como .xlsx (Libro de Excel) e inténtalo de nuevo.');
  }
  const hoja = libro.getWorksheet('Carta') ?? libro.worksheets[0];
  if (!hoja) throw new HttpError(400, 'El Excel no tiene hojas.');
  const filas: FilaHoja[] = [];
  hoja.eachRow({ includeEmpty: false }, (row, n) => {
    const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
    filas.push({ fila: n, celdas: Array.from(vals, (v) => valorCelda((v ?? null) as ExcelJS.CellValue)) });
  });
  return filas;
}

function decodificar(datos: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(datos).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(datos); // CSV guardado por Excel en "ANSI"
  }
}

/** CSV con comillas, saltos de línea entre comillas y separador ; , o tabulador (se detecta solo). */
function leerCsv(datos: Uint8Array): FilaHoja[] {
  const txt = decodificar(datos);
  const primera = txt.slice(0, Math.max(0, txt.search(/\r?\n|$/)));
  const sep = ([';', ',', '\t'] as const).reduce((a, b) => (primera.split(b).length > primera.split(a).length ? b : a), ';' as string);
  const filas: FilaHoja[] = [];
  let celdas: Celda[] = [], campo = '', entreComillas = false, linea = 1, inicio = 1;
  const cerrarFila = () => {
    celdas.push(campo);
    if (celdas.some((c) => texto(c) !== '')) filas.push({ fila: inicio, celdas });
    celdas = []; campo = '';
  };
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (entreComillas) {
      if (ch === '"' && txt[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') entreComillas = false;
      else { if (ch === '\n') linea++; campo += ch; }
    } else if (ch === '"' && campo === '') entreComillas = true;
    else if (ch === sep) { celdas.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && txt[i + 1] === '\n') i++;
      cerrarFila(); linea++; inicio = linea;
    } else campo += ch;
  }
  if (campo !== '' || celdas.length) cerrarFila();
  return filas;
}

async function leerArchivo(nombre: string, datos: Uint8Array<ArrayBuffer>): Promise<FilaHoja[]> {
  const esZip = datos.length > 4 && datos[0] === 0x50 && datos[1] === 0x4b; // .xlsx es un ZIP ("PK")
  if (esZip || /\.xlsx$/i.test(nombre)) return leerXlsx(datos);
  if (/\.xls$/i.test(nombre)) throw new HttpError(415, 'El formato .xls (Excel 97-2003) no se admite. Guárdalo como .xlsx o .csv.');
  return leerCsv(datos);
}

/* ---------- Conversión de valores ---------- */

function leerPrecio(v: Celda): number | null | 'invalido' {
  if (v == null || texto(v) === '') return null;
  return leerPesos(typeof v === 'number' ? v : texto(v)) ?? 'invalido';
}

function leerSiNo(v: Celda): boolean | null | 'invalido' {
  if (typeof v === 'boolean') return v;
  const s = norm(texto(v));
  if (!s) return null;
  if (['si', 's', '1', 'true', 'x', 'activo', 'activa', 'visible', 'yes'].includes(s)) return true;
  if (['no', 'n', '0', 'false', 'oculto', 'oculta', 'inactivo', 'inactiva'].includes(s)) return false;
  return 'invalido';
}

/* ---------- Plan de la carga ---------- */

type OpcionNueva = { codigo: string; nombre: string | null; detalle: string | null; precio: number; activo: boolean };
type CamposProducto = { categoria?: string; descripcion?: string; opcion?: string; img?: string; agotado?: boolean; destacado?: boolean };
type ProductoNuevo = { clave: string; nombre: string; categoria: string; descripcion: string; opcion: string; img: string; agotado: boolean; destacado: boolean; opciones: OpcionNueva[] };

type Plan = VistaPreviaCarga & {
  productosNuevos: ProductoNuevo[];
  opcionesEnExistentes: { productoId: number; opcion: OpcionNueva }[];
  cambiosOpciones: { id: number; data: Partial<OpcionNueva> }[];
  cambiosProductos: Map<number, CamposProducto>;
};

async function planificar(archivo: string, datos: Uint8Array<ArrayBuffer>, modo: ModoCarga): Promise<Plan> {
  const filasHoja = await leerArchivo(archivo, datos);
  const idxCab = filasHoja.findIndex((f) => f.celdas.some((c) => ['producto', 'codigo'].includes(norm(texto(c)))));
  if (idxCab < 0) throw new HttpError(400, 'No se encontró la fila de encabezados (debe tener la columna "producto" o "codigo"). Usa la plantilla.');
  const cab = filasHoja[idxCab].celdas.map((c) => COLUMNAS.find((col) => col.alias.includes(norm(texto(c))))?.campo ?? null);
  const columnasIgnoradas = filasHoja[idxCab].celdas.filter((c, i) => texto(c) && !cab[i]).map(texto);
  const filasDatos = filasHoja.slice(idxCab + 1);
  if (filasDatos.length > MAX_FILAS) throw new HttpError(400, `El archivo tiene ${filasDatos.length} filas; el máximo es ${MAX_FILAS}.`);

  const [variantes, productos, categorias] = await Promise.all([
    prisma.variante.findMany({ select: { id: true, codigo: true, nombre: true, detalle: true, precio: true, activo: true, productoId: true } }),
    prisma.producto.findMany({ select: { id: true, nombre: true, descripcion: true, opcion: true, img: true, agotado: true, destacado: true, categoria: { select: { nombre: true } } } }),
    prisma.categoria.findMany({ select: { nombre: true } }),
  ]);
  const porId = new Map(variantes.map((v) => [v.id, v]));
  const porCodigo = new Map(variantes.map((v) => [v.codigo.toLowerCase(), v]));
  const usados = new Set(variantes.map((v) => v.codigo.toLowerCase()));
  const productoPorId = new Map(productos.map((p) => [p.id, p]));
  const productoPorClave = new Map(productos.map((p) => [clave(p.nombre), p]));
  const catPorClave = new Map(categorias.map((c) => [clave(c.nombre), c.nombre]));
  const opcionesDe = (productoId: number) => variantes.filter((v) => v.productoId === productoId);

  const filas: FilaCarga[] = [];
  const productosNuevos = new Map<string, ProductoNuevo & { filas: FilaCarga[] }>();
  const opcionesEnExistentes: Plan['opcionesEnExistentes'] = [];
  const cambiosOpciones: Plan['cambiosOpciones'] = [];
  const cambiosProductos = new Map<number, CamposProducto>();
  const productosVistos = new Set<number>();
  const categoriasNuevas = new Set<string>();
  const tocadas = new Set<number>();
  let ejemploIgnorado = false;

  for (const { fila, celdas } of filasDatos) {
    const v: Partial<Record<Campo, Celda>> = {};
    cab.forEach((campo, i) => { if (campo && v[campo] === undefined) v[campo] = celdas[i] ?? null; });
    const codigo = texto(v.codigo ?? null).slice(0, 40).toUpperCase().replace(/\s+/g, '-');
    const productoTxt = texto(v.producto ?? null).slice(0, 150);
    const varianteTxt = texto(v.variante ?? null).slice(0, 80);
    if (celdas.every((c) => texto(c) === '')) continue;
    if (codigo === CODIGO_EJEMPLO) { ejemploIgnorado = true; continue; }
    const out: FilaCarga = { fila, codigo, nombre: [productoTxt, varianteTxt].filter(Boolean).join(' · '), accion: 'error', cambios: [] };
    filas.push(out);
    const fallar = (msg: string) => { out.error = msg; };

    if (codigo && !/^[A-Z0-9][A-Z0-9._\-]*$/.test(codigo)) { fallar('Código inválido: usa letras, números y guiones.'); continue; }
    const precio = leerPrecio(v.precio ?? null);
    if (precio === 'invalido') { fallar(`Precio inválido: ${texto(v.precio ?? null)} (en pesos, sin decimales).`); continue; }
    const flags: Record<'activo' | 'agotado' | 'destacado', boolean | null> = { activo: null, agotado: null, destacado: null };
    let flagMalo = '';
    for (const k of ['activo', 'agotado', 'destacado'] as const) {
      const b = leerSiNo(v[k] ?? null);
      if (b === 'invalido') { flagMalo = `Valor de "${COLUMNAS.find((c) => c.campo === k)!.titulo}" no reconocido: ${texto(v[k] ?? null)} (usa SI o NO).`; break; }
      flags[k] = b;
    }
    if (flagMalo) { fallar(flagMalo); continue; }
    const detalle = texto(v.detalle ?? null).slice(0, 255);
    const catTxt = texto(v.categoria ?? null).slice(0, 80);
    const descripcion = texto(v.descripcion ?? null).slice(0, 600);
    const selector = texto(v.selector ?? null).slice(0, 40);
    const img = texto(v.img ?? null).slice(0, 255);
    if (img && !fotoValida(img)) { fallar('La foto debe ser una ruta que empiece por / o una URL http(s).'); continue; }

    // ¿Qué opción existente es? Por id interno o por código.
    const idTxt = texto(v.id ?? null);
    let existente: (typeof variantes)[number] | undefined;
    if (idTxt) {
      existente = /^\d{1,10}$/.test(idTxt) ? porId.get(Number(idTxt)) : undefined;
      if (!existente) { fallar(`No existe una opción con id ${idTxt}. Deja el id vacío para crearla.`); continue; }
    } else if (codigo) existente = porCodigo.get(codigo.toLowerCase());
    if (existente && tocadas.has(existente.id)) { fallar('Esta opción ya aparece en otra fila del archivo (solo se usa la primera).'); continue; }
    if (existente && modo === 'crear') { fallar('Ya existe una opción con este código (modo "solo crear").'); continue; }
    if (!existente && modo === 'actualizar') { fallar('No existe una opción con este código (modo "solo actualizar").'); continue; }

    if (existente) {
      tocadas.add(existente.id);
      const prod = productoPorId.get(existente.productoId)!;
      out.nombre = [prod.nombre, existente.nombre].filter(Boolean).join(' · ');
      const data: Partial<OpcionNueva> = {};
      if (idTxt && codigo && codigo !== existente.codigo) {
        if (usados.has(codigo.toLowerCase())) { fallar(`El código ${codigo} ya lo usa otra opción.`); continue; }
        usados.delete(existente.codigo.toLowerCase()); usados.add(codigo.toLowerCase());
        data.codigo = codigo; out.cambios.push({ campo: ETIQUETA.codigo, antes: existente.codigo, despues: codigo });
      }
      if (varianteTxt && varianteTxt !== (existente.nombre ?? '')) { data.nombre = varianteTxt; out.cambios.push({ campo: ETIQUETA.variante, antes: existente.nombre ?? 'Única', despues: varianteTxt }); }
      if (precio !== null && precio !== existente.precio) { data.precio = precio; out.cambios.push({ campo: ETIQUETA.precio, antes: pesos(existente.precio), despues: pesos(precio) }); }
      if (detalle && detalle !== (existente.detalle ?? '')) { data.detalle = detalle; out.cambios.push({ campo: ETIQUETA.detalle, antes: existente.detalle ?? '', despues: detalle }); }
      if (flags.activo !== null && flags.activo !== existente.activo) { data.activo = flags.activo; out.cambios.push({ campo: ETIQUETA.activo, antes: siNo(existente.activo), despues: siNo(flags.activo) }); }
      if (Object.keys(data).length) cambiosOpciones.push({ id: existente.id, data });

      // Campos del producto: se toman de la primera fila de cada producto.
      if (!productosVistos.has(prod.id)) {
        productosVistos.add(prod.id);
        const c: CamposProducto = {};
        if (catTxt && clave(catTxt) !== clave(prod.categoria.nombre)) {
          c.categoria = catPorClave.get(clave(catTxt)) ?? catTxt;
          if (!catPorClave.has(clave(catTxt))) categoriasNuevas.add(c.categoria);
          out.cambios.push({ campo: ETIQUETA.categoria, antes: prod.categoria.nombre, despues: c.categoria });
        }
        if (descripcion && descripcion !== prod.descripcion) { c.descripcion = descripcion; out.cambios.push({ campo: ETIQUETA.descripcion, antes: prod.descripcion, despues: descripcion }); }
        if (selector && selector !== prod.opcion) { c.opcion = selector; out.cambios.push({ campo: ETIQUETA.selector, antes: prod.opcion, despues: selector }); }
        if (img && img !== prod.img) { c.img = img; out.cambios.push({ campo: ETIQUETA.img, antes: prod.img, despues: img }); }
        if (flags.agotado !== null && flags.agotado !== prod.agotado) { c.agotado = flags.agotado; out.cambios.push({ campo: ETIQUETA.agotado, antes: siNo(prod.agotado), despues: siNo(flags.agotado) }); }
        if (flags.destacado !== null && flags.destacado !== prod.destacado) { c.destacado = flags.destacado; out.cambios.push({ campo: ETIQUETA.destacado, antes: siNo(prod.destacado), despues: siNo(flags.destacado) }); }
        if (Object.keys(c).length) cambiosProductos.set(prod.id, c);
      }
      out.accion = out.cambios.length ? 'actualizar' : 'sin cambios';
      continue;
    }

    // Opción nueva
    if (!productoTxt) { fallar('Falta el producto (nombre de la tarjeta en la carta).'); continue; }
    if (precio === null) { fallar('Falta el precio (obligatorio para opciones nuevas).'); continue; }
    const prodExistente = productoPorClave.get(clave(productoTxt));
    const base = prodExistente?.nombre ?? productoTxt;
    if (codigo && usados.has(codigo.toLowerCase())) { fallar(`El código ${codigo} ya existe (en la carta o más arriba en el archivo).`); continue; }
    const nuevoCodigo = libre(codigo || codigoDe(base, varianteTxt || null), usados, 40);
    usados.add(nuevoCodigo.toLowerCase());
    const opcion: OpcionNueva = { codigo: nuevoCodigo, nombre: varianteTxt || null, detalle: detalle || null, precio, activo: flags.activo ?? true };
    out.codigo = nuevoCodigo;
    out.nombre = [base, varianteTxt].filter(Boolean).join(' · ');

    if (prodExistente) {
      const ya = opcionesDe(prodExistente.id);
      if (!varianteTxt) { fallar(`"${base}" ya existe: escribe el nombre de la opción nueva (columna opcion).`); usados.delete(nuevoCodigo.toLowerCase()); continue; }
      if (ya.some((x) => !x.nombre)) { fallar(`"${base}" tiene una opción sin nombre: pónsela en el panel antes de agregar opciones.`); usados.delete(nuevoCodigo.toLowerCase()); continue; }
      if (ya.some((x) => clave(x.nombre ?? '') === clave(varianteTxt))) { fallar(`"${base}" ya tiene la opción "${varianteTxt}".`); usados.delete(nuevoCodigo.toLowerCase()); continue; }
      opcionesEnExistentes.push({ productoId: prodExistente.id, opcion });
      out.accion = 'crear';
      continue;
    }

    const k = clave(productoTxt);
    let nuevo = productosNuevos.get(k);
    if (!nuevo) {
      if (!catTxt) { fallar('Falta la categoría (sección de la carta).'); usados.delete(nuevoCodigo.toLowerCase()); continue; }
      const categoria = catPorClave.get(clave(catTxt)) ?? catTxt;
      if (!catPorClave.has(clave(catTxt))) categoriasNuevas.add(categoria);
      nuevo = { clave: k, nombre: productoTxt, categoria, descripcion, opcion: selector, img, agotado: flags.agotado ?? false, destacado: flags.destacado ?? false, opciones: [], filas: [] };
      productosNuevos.set(k, nuevo);
    }
    if (nuevo.opciones.some((x) => clave(x.nombre ?? '') === clave(varianteTxt))) { fallar(`"${productoTxt}" ya tiene la opción "${varianteTxt || 'Única'}" más arriba.`); usados.delete(nuevoCodigo.toLowerCase()); continue; }
    nuevo.opciones.push(opcion); nuevo.filas.push(out);
    out.accion = 'crear';
  }

  // Un producto nuevo con varias opciones necesita el nombre de cada una.
  for (const p of [...productosNuevos.values()]) {
    if (p.opciones.length > 1 && p.opciones.some((o) => !o.nombre)) {
      for (const f of p.filas) { f.accion = 'error'; f.error = `"${p.nombre}" tiene varias opciones: cada fila necesita su nombre (columna opcion).`; }
      productosNuevos.delete(p.clave);
    } else if (p.opciones.length > 1 && !p.opcion) p.opcion = 'Opción';
  }
  for (const c of [...categoriasNuevas]) {
    const usada = [...productosNuevos.values()].some((p) => p.categoria === c) || [...cambiosProductos.values()].some((x) => x.categoria === c);
    if (!usada) categoriasNuevas.delete(c);
  }

  const cuenta = (a: AccionFila) => filas.filter((f) => f.accion === a).length;
  return {
    token: createHash('sha256').update(datos).update(`|${modo}`).digest('hex'),
    archivo,
    resumen: { filas: filas.length, nuevos: cuenta('crear'), actualizar: cuenta('actualizar'), sinCambios: cuenta('sin cambios'), errores: cuenta('error') },
    filas,
    categoriasNuevas: [...categoriasNuevas],
    columnasIgnoradas,
    ejemploIgnorado,
    productosNuevos: [...productosNuevos.values()].map((p) => ({
      clave: p.clave, nombre: p.nombre, categoria: p.categoria, descripcion: p.descripcion, opcion: p.opcion,
      img: p.img, agotado: p.agotado, destacado: p.destacado, opciones: p.opciones,
    })),
    opcionesEnExistentes,
    cambiosOpciones,
    cambiosProductos,
  };
}

export async function vistaPreviaCarga(archivo: string, datos: Uint8Array<ArrayBuffer>, modo: ModoCarga): Promise<VistaPreviaCarga> {
  const p = await planificar(archivo, datos, modo);
  return { token: p.token, archivo, resumen: p.resumen, filas: p.filas, categoriasNuevas: p.categoriasNuevas, columnasIgnoradas: p.columnasIgnoradas, ejemploIgnorado: p.ejemploIgnorado };
}

export async function aplicarCarga(archivo: string, datos: Uint8Array<ArrayBuffer>, modo: ModoCarga, token: string): Promise<ResultadoCarga> {
  const plan = await planificar(archivo, datos, modo);
  if (!token || token !== plan.token) throw new HttpError(409, 'El archivo no coincide con la vista previa. Vuelve a revisarlo antes de aplicar.');
  if (!plan.resumen.nuevos && !plan.resumen.actualizar) throw new HttpError(400, 'No hay opciones para crear ni actualizar.');

  // 1) Categorías nuevas (al final de la carta)
  let ordenCat = ((await prisma.categoria.aggregate({ _max: { orden: true } }))._max.orden ?? 0) + 1;
  for (const nombre of plan.categoriasNuevas) await prisma.categoria.upsert({ where: { nombre }, update: {}, create: { nombre, orden: ordenCat++ } });
  const catId = new Map((await prisma.categoria.findMany({ select: { id: true, nombre: true } })).map((c) => [c.nombre, c.id]));

  const slugs = new Set((await prisma.producto.findMany({ select: { slug: true } })).map((p) => p.slug.toLowerCase()));
  let ordenProd = ((await prisma.producto.aggregate({ _max: { orden: true } }))._max.orden ?? 0) + 1;
  let ordenVar = ((await prisma.variante.aggregate({ _max: { orden: true } }))._max.orden ?? 0) + 1;

  const ops = [
    // 2) Productos nuevos con sus opciones
    ...plan.productosNuevos.map((p) => {
      const slug = libre(slugify(p.nombre) || 'producto', slugs, 160);
      slugs.add(slug.toLowerCase());
      return prisma.producto.create({
        data: {
          nombre: p.nombre, descripcion: p.descripcion, opcion: p.opcion, img: p.img, agotado: p.agotado, destacado: p.destacado,
          slug, categoriaId: catId.get(p.categoria)!, orden: ordenProd++,
          variantes: { create: p.opciones.map((o) => ({ ...o, orden: ordenVar++ })) },
        },
      });
    }),
    // 3) Opciones nuevas en productos existentes
    ...plan.opcionesEnExistentes.map(({ productoId, opcion }) => prisma.variante.create({ data: { ...opcion, productoId, orden: ordenVar++ } })),
    // 4) Cambios en opciones y productos
    ...plan.cambiosOpciones.map(({ id, data }) => prisma.variante.update({ where: { id }, data })),
    ...[...plan.cambiosProductos].map(([id, { categoria, ...c }]) =>
      prisma.producto.update({ where: { id }, data: { ...c, ...(categoria ? { categoriaId: catId.get(categoria)! } : {}) } })),
  ];
  for (let i = 0; i < ops.length; i += 200) await prisma.$transaction(ops.slice(i, i + 200));

  return {
    creados: plan.resumen.nuevos,
    actualizados: plan.resumen.actualizar,
    sinCambios: plan.resumen.sinCambios,
    errores: plan.resumen.errores,
    categoriasNuevas: plan.categoriasNuevas,
  };
}

/* ---------- Plantillas ---------- */

// id, codigo, producto, opcion, precio, detalle, categoria, descripcion, selector, visible, agotado, destacado, foto
const EJEMPLO = ['', CODIGO_EJEMPLO, 'Pollo Ejemplo', 'Medio', 8000, '', 'Pollos y promos', 'Con papas fritas', 'Tamaño', 'SI', 'NO', 'NO', '/productos/pollo-asado.webp'];

export async function generarPlantilla(formato: 'xlsx' | 'csv', conCarta: boolean): Promise<{ datos: Uint8Array; nombre: string; tipo: string }> {
  const filas: (string | number)[][] = conCarta
    ? (await prisma.variante.findMany({
      include: { producto: { include: { categoria: { select: { nombre: true, orden: true } } } } },
      orderBy: [{ producto: { categoria: { orden: 'asc' } } }, { producto: { orden: 'asc' } }, { precio: 'asc' }, { orden: 'asc' }],
    })).map((v) => [
      v.id, v.codigo, v.producto.nombre, v.nombre ?? '', v.precio, v.detalle ?? '', v.producto.categoria.nombre, v.producto.descripcion,
      v.producto.opcion, v.activo ? 'SI' : 'NO', v.producto.agotado ? 'SI' : 'NO', v.producto.destacado ? 'SI' : 'NO', v.producto.img,
    ])
    : [EJEMPLO];
  const fecha = new Date().toISOString().slice(0, 10);
  const base = conCarta ? `carta-dicenso-${fecha}` : 'plantilla-carta-dicenso';
  const cabecera = COLUMNAS.map((c) => c.titulo);

  if (formato === 'csv') {
    const esc = (x: string | number) => {
      const s = String(x);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = '﻿' + [cabecera, ...filas].map((f) => f.map(esc).join(';')).join('\r\n') + '\r\n';
    return { datos: new TextEncoder().encode(csv), nombre: `${base}.csv`, tipo: 'text/csv; charset=utf-8' };
  }

  const categorias = await prisma.categoria.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }], select: { nombre: true } });
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Di Censo Pollo';
  const hoja = libro.addWorksheet('Carta', { views: [{ state: 'frozen', ySplit: 1 }] });
  const ancho: Partial<Record<Campo, number>> = { id: 7, codigo: 28, producto: 24, variante: 16, precio: 10, detalle: 30, categoria: 22, descripcion: 44, selector: 12, img: 32 };
  hoja.columns = COLUMNAS.map((c) => ({ header: c.titulo, key: c.campo, width: ancho[c.campo] ?? 10, style: c.campo === 'precio' ? { numFmt: '"$"#,##0' } : {} }));
  const cab = hoja.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3261B' } };
  hoja.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8C8C8C' } };
  hoja.addRows(filas);
  if (!conCarta) hoja.getRow(2).font = { italic: true, color: { argb: 'FF8B8B8B' } };

  const colCat = COLUMNAS.findIndex((c) => c.campo === 'categoria') + 1;
  const colsSiNo = ['activo', 'agotado', 'destacado'].map((k) => COLUMNAS.findIndex((c) => c.campo === k) + 1);
  const total = Math.max(filas.length + 200, 500);
  for (let r = 2; r <= total + 1; r++) {
    hoja.getCell(r, colCat).dataValidation = { type: 'list', allowBlank: true, showErrorMessage: false, formulae: [`Categorias!$A$2:$A$${Math.max(2, categorias.length + 1)}`] };
    for (const c of colsSiNo) hoja.getCell(r, c).dataValidation = { type: 'list', allowBlank: true, formulae: ['"SI,NO"'] };
  }

  const cats = libro.addWorksheet('Categorias');
  cats.columns = [{ header: 'categoria', width: 30 }];
  cats.getRow(1).font = { bold: true };
  for (const c of categorias) cats.addRow([c.nombre]);

  const inst = libro.addWorksheet('Instrucciones');
  inst.columns = [{ header: 'columna', width: 12 }, { header: 'qué escribir', width: 110 }];
  inst.getRow(1).font = { bold: true };
  for (const c of COLUMNAS) inst.addRow([c.titulo, c.ayuda]);
  inst.addRow([]);
  for (const t of [
    'Cada fila es una OPCIÓN con precio. Las filas con el mismo producto forman una sola tarjeta en la carta.',
    'Producto sin opciones (ej.: Hamburguesa): una sola fila con la columna opcion vacía.',
    'Si el producto ya existe, la opción nueva se agrega a esa tarjeta.',
    'En lo que ya existe, una celda vacía NO cambia el valor actual. Solo cambia lo que escribas.',
    'Para cambiar precios en lote: descarga la carta actual, edita la columna precio y súbela con "Solo actualizar".',
    'Para cambiar el nombre de un producto usa el panel → Carta (la columna producto identifica la tarjeta).',
    `La fila de ejemplo (código ${CODIGO_EJEMPLO}) se ignora; puedes borrarla.`,
    'Antes de guardar verás una vista previa con lo que se crea, lo que cambia y las filas con errores.',
  ]) inst.addRow(['', t]);

  const buf = await libro.xlsx.writeBuffer();
  return { datos: new Uint8Array(buf as ArrayBuffer), nombre: `${base}.xlsx`, tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
