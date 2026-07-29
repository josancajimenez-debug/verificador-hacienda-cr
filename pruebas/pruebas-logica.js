/**
 * Banco de pruebas de la lógica pura de index.html.
 * Carga el <script> del archivo en un contexto vm con un DOM mínimo simulado
 * y ejecuta aserciones sobre validadores, normalizadores y clasificadores.
 */
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const HTML = process.argv[2];
const src = fs.readFileSync(HTML, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];

/* ---- DOM simulado, suficiente para que init() no reviente ---------------- */
function fakeElement(tag = "div") {
  const node = {
    tagName: tag.toUpperCase(),
    children: [], childNodes: [], firstChild: null,
    style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
    attributes: {},
    _text: "",
    get textContent(){ return this._text }, set textContent(v){ this._text = String(v) },
    value: "", checked: false, hidden: false, disabled: false, tabIndex: 0, max: "",
    appendChild(c){ this.children.push(c); this.childNodes.push(c); return c },
    removeChild(c){ const i=this.children.indexOf(c); if(i>-1){this.children.splice(i,1); this.childNodes.splice(i,1)} return c },
    setAttribute(k,v){ this.attributes[k]=String(v) },
    getAttribute(k){ return this.attributes[k] ?? null },
    removeAttribute(k){ delete this.attributes[k] },
    addEventListener(){}, removeEventListener(){}, focus(){}, click(){}, select(){},
    querySelector(){ return null }, querySelectorAll(){ return [] },
    reset(){}, contains(){ return false }
  };
  return node;
}

const document = {
  documentElement: fakeElement("html"),
  body: fakeElement("body"),
  readyState: "complete",
  createElement: (t) => fakeElement(t),
  createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
  getElementById: () => fakeElement(),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  execCommand: () => true
};

const sandbox = {
  console,
  document,
  window: { isSecureContext: false, addEventListener(){} },
  navigator: { onLine: true, clipboard: null },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { href: "http://localhost/" },
  fetch: async () => { throw new TypeError("fetch no disponible en pruebas") },
  AbortController, URL, URLSearchParams, Blob: class {}, Intl, Date, Math, JSON,
  setTimeout, clearTimeout, setInterval, clearInterval, Promise, TypeError, Error
};
sandbox.globalThis = sandbox;
sandbox.window.location = sandbox.location;

vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "index.html:script" });

/* ---- Utilidades de aserción -------------------------------------------- */
let pasadas = 0, fallidas = 0;
const casos = [];
function check(grupo, descripcion, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  ok ? pasadas++ : fallidas++;
  casos.push({ grupo, descripcion, ok, real, esperado });
  if (!ok) console.error(`  ✗ [${grupo}] ${descripcion}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`);
}

/**
 * Acceso a las declaraciones del script.
 * En un contexto vm, `function` sí queda en el objeto global pero `const` no,
 * por lo que las constantes se leen evaluando su nombre dentro del contexto.
 */
const g = (n) => (n in sandbox ? sandbox[n] : vm.runInContext(n, sandbox));

/* ======================= 1. VALIDACIÓN DE IDENTIFICACIÓN ================= */
const vi = g("validarIdentificacion");
check("identificacion", "cédula jurídica de 10 dígitos válida", vi("3101012386").ok, true);
check("identificacion", "normaliza guiones y espacios", vi("3-101-012386").valor, "3101012386");
check("identificacion", "cédula física de 9 dígitos válida", vi("110100123").ok, true);
check("identificacion", "DIMEX de 12 dígitos válido", vi("155812345678").ok, true);
check("identificacion", "rechaza 8 dígitos (menos de 9)", vi("12345678").ok, false);
check("identificacion", "rechaza 13 dígitos (más de 12)", vi("1234567890123").ok, false);
check("identificacion", "rechaza letras", vi("abc123456").ok, false);
check("identificacion", "rechaza cadena vacía", vi("").ok, false);
check("identificacion", "rechaza sólo espacios", vi("   ").ok, false);
// Regla verificada contra la API: un 0 inicial produce HTTP 400 en /fe/ae,
// /fe/agropecuario y /fe/pesca, pese a lo que afirma documentación de terceros.
check("identificacion", "rechaza cédula física con 0 inicial", vi("0110100123").ok, false);
check("identificacion", "el mensaje del 0 inicial es explicativo",
  /no debe comenzar con cero/i.test(vi("0110100123").mensaje), true);
check("identificacion", "rechaza jurídica con 0 inicial", vi("03101012386").ok, false);
check("identificacion", "acepta la misma cédula sin el 0 inicial", vi("110100123").ok, true);

/* ======================= 2. AUTORIZACIÓN DE EXONERACIÓN ================== */
const na = g("normalizarAutorizacion");
const va = g("validarAutorizacion");
check("exoneracion", "convierte 10 dígitos a AL-XXXXXXXX-XX", na("0046085320"), "AL-00460853-20");
check("exoneracion", "convierte minúsculas al formato oficial", na("al-00460853-20"), "AL-00460853-20");
check("exoneracion", "acepta separadores libres", na("AL 00460853 20"), "AL-00460853-20");
check("exoneracion", "acepta formato parcial sin prefijo", na("00460853-20"), "AL-00460853-20");
check("exoneracion", "valida el formato correcto", va("al-00460853-20").ok, true);
check("exoneracion", "rechaza 7 dígitos en el bloque central", va("AL-0460853-20").ok, false);
check("exoneracion", "rechaza prefijo distinto de AL", va("XX-00460853-20").ok, false);
check("exoneracion", "rechaza cadena vacía", va("").ok, false);
check("exoneracion", "rechaza texto arbitrario", va("no es un numero").ok, false);

/* ======================= 4. CÓDIGO CABYS ================================= */
const vc = g("validarCabysCodigo");
const vd = g("validarCabysDescripcion");
check("cabys", "código de 13 dígitos válido", vc("2132100000100").ok, true);
check("cabys", "rechaza 12 dígitos", vc("213210000010").ok, false);
check("cabys", "rechaza 14 dígitos", vc("21321000001000").ok, false);
check("cabys", "rechaza letras", vc("21321000001AB").ok, false);
check("cabys", "descripción de 3 caracteres válida", vd("jug").ok, true);
check("cabys", "rechaza 2 caracteres", vd("ju").ok, false);
check("cabys", "normaliza espacios múltiples", vd("jugo   de  tomate").valor, "jugo de tomate");

/* ======================= 5. ERRORES INCRUSTADOS EN HTTP 200 ============== */
const dei = g("detectarErrorIncrustado");
check("errores", "detecta 404 RFC7231 de /fe/agropecuario",
  dei({ type: "https://tools.ietf.org/html/rfc7231#section-6.5.4", title: "Not Found", status: 404 })?.kind, "not-found");
check("errores", "detecta {code:404,status:'Information no available'}",
  dei({ code: 404, status: "Information no available on this system" })?.kind, "not-found");
check("errores", "detecta 400", dei({ code: 400, status: "Bad request" })?.kind, "bad-request");
check("errores", "detecta 429", dei({ code: 429, status: "Too many requests" })?.kind, "rate-limited");
check("errores", "detecta 503", dei({ code: 503, status: "Service unavailable" })?.kind, "server");
check("errores", "no marca error una respuesta válida de /fe/ae",
  dei({ nombre: "BANCO NACIONAL DE COSTA RICA", tipoIdentificacion: "02", actividades: [] }), null);
check("errores", "no marca error el tipo de cambio",
  dei({ venta: { fecha: "2026-07-29", valor: 454.55 }, compra: { fecha: "2026-07-29", valor: 449.94 } }), null);
check("errores", "ignora arreglos (respuesta de CABYS por código)",
  dei([{ codigo: "2132100000100" }]), null);

/* ======================= 6. EXTRACCIÓN DE CABYS ========================== */
const ec = g("extraerCabys");
check("cabys-parse", "arreglo directo (búsqueda por código)",
  ec([{ codigo: "2132100000100", descripcion: "Jugo de tomate concentrado", impuesto: 13 }]).items.length, 1);
check("cabys-parse", "objeto {total,cantidad,cabys} (búsqueda por descripción)",
  ec({ total: 16, cantidad: 5, cabys: [{ codigo: "a" }, { codigo: "b" }] }).items.length, 2);
check("cabys-parse", "conserva el total informado por la API",
  ec({ total: 16, cantidad: 5, cabys: [{ codigo: "a" }] }).total, 16);
check("cabys-parse", "arreglo vacío (código inexistente)", ec([]).items.length, 0);
check("cabys-parse", "estructura no reconocida devuelve null", ec("texto suelto"), null);

/* ======================= 8. CONSTRUCCIÓN DE URL ========================== */
const bu = g("buildUrl");
check("url", "sin parámetros", bu("/indicadores/tc/dolar", {}), "https://api.hacienda.go.cr/indicadores/tc/dolar");
check("url", "con un parámetro", bu("/fe/ae", { identificacion: "3101012386" }),
  "https://api.hacienda.go.cr/fe/ae?identificacion=3101012386");
check("url", "omite parámetros vacíos", bu("/fe/cabys", { codigo: "", q: "arroz", top: 5 }),
  "https://api.hacienda.go.cr/fe/cabys?q=arroz&top=5");
check("url", "codifica espacios en la descripción", bu("/fe/cabys", { q: "jugo de tomate" }),
  "https://api.hacienda.go.cr/fe/cabys?q=jugo+de+tomate");

/* ======================= 9. FORMATO Y UTILIDADES ========================= */
check("formato", "fecha ISO con hora sin desfase de zona", g("fmtFecha")("2020-12-15T00:00:00"), "15 de diciembre de 2020");
check("formato", "fecha ISO simple", g("fmtFecha")("2026-07-29"), "29 de julio de 2026");
check("formato", "valor no fecha se devuelve intacto", g("fmtFecha")("sin fecha"), "sin fecha");
check("formato", "extrae la parte AAAA-MM-DD", g("isoDatePart")("2020-12-15T00:00:00"), "2020-12-15");
check("formato", "humaniza camelCase", g("humanizeKey")("fechaVencimiento"), "Fecha vencimiento");
check("formato", "humaniza snake_case", g("humanizeKey")("codigo_proyecto"), "Codigo proyecto");
check("formato", "hasValue rechaza cadena vacía", g("hasValue")("  "), false);
check("formato", "hasValue rechaza arreglo vacío", g("hasValue")([]), false);
check("formato", "hasValue acepta cero", g("hasValue")(0), true);
check("formato", "hasValue rechaza null", g("hasValue")(null), false);

/* ======================= 10. CATÁLOGOS =================================== */
check("catalogos", "tipo 01 = persona física", g("TIPOS_IDENTIFICACION")["01"], "Cédula de persona física");
check("catalogos", "tipo 02 = persona jurídica", g("TIPOS_IDENTIFICACION")["02"], "Cédula de persona jurídica");
check("catalogos", "ruta oficial de /fe/ae", g("RUTAS").ae, "/fe/ae");
check("catalogos", "origen oficial", g("API_BASE"), "https://api.hacienda.go.cr");

/* ======================= INFORME ======================================== */
console.log("\n" + "=".repeat(72));
const grupos = [...new Set(casos.map((c) => c.grupo))];
for (const gr of grupos) {
  const del = casos.filter((c) => c.grupo === gr);
  const ok = del.filter((c) => c.ok).length;
  console.log(`  ${ok === del.length ? "✓" : "✗"} ${gr.padEnd(16)} ${ok}/${del.length}`);
}
console.log("=".repeat(72));
console.log(`  TOTAL: ${pasadas} pruebas superadas, ${fallidas} fallidas`);
console.log("=".repeat(72));
process.exit(fallidas === 0 ? 0 : 1);
