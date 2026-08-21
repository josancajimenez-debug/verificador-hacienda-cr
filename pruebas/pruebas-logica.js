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
  window: {
    isSecureContext: false, addEventListener(){},
    /* createClient() se llama al cargar el script (const sb = ...) e
       initMembership() registra sb.auth.onAuthStateChange() al arrancar,
       aunque este banco nunca ejercite la membresía en sí (los métodos que
       sólo se usan dentro de manejadores de eventos, que aquí jamás se
       disparan porque el DOM simulado no invoca callbacks, no hace falta
       simularlos con más detalle que "no revienta al construirse").
       */
    supabase: {
      createClient: () => ({
        auth: {
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
          getSession: async () => ({ data: { session: null } }),
          signInWithPassword: async () => ({ error: null }),
          signUp: async () => ({ error: null }),
          signOut: async () => ({ error: null }),
          resetPasswordForEmail: async () => ({ error: null }),
          updateUser: async () => ({ error: null })
        },
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }), insert: async () => ({ error: null }) }),
        rpc: async () => ({ error: null })
      })
    }
  },
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

/* ======= 7. REGISTROS PESQUERO Y AGROPECUARIO (estructura real) ========== */
/*
 * Forma observada en una respuesta real de /fe/pesca: tres listas, una por
 * registro. Los datos de los ejemplos son ficticios; sólo se reproduce la
 * estructura y los nombres de los campos.
 */
const cr = g("contarRegistros");
const ev = g("evaluarVigencia");
const hoy = g("hoyISO")();
const anioPasado = (Number(hoy.slice(0, 4)) - 1) + hoy.slice(4);
const anioFuturo = (Number(hoy.slice(0, 4)) + 1) + hoy.slice(4);

const RESPUESTA_VACIA = { listaDatosMAG: [], listaDatosIncopesca: [], listaDatosAcuicultores: [] };
const RESPUESTA_CON_DATOS = {
  listaDatosMAG: [],
  listaDatosIncopesca: [{
    nombrePermisonarioIncopesca: "NOMBRE DE EJEMPLO",
    fechaVenceIncopesca: anioPasado,
    indicadorActivoIncopesca: false
  }],
  listaDatosAcuicultores: []
};

// El caso decisivo: tres listas presentes pero TODAS vacías. Comprobar sólo
// que el objeto tenga claves haría anunciar «registro encontrado» sin datos.
check("registros", "tres listas vacías cuentan como cero registros", cr(RESPUESTA_VACIA).total, 0);
check("registros", "conserva las tres listas aunque estén vacías", cr(RESPUESTA_VACIA).listas.length, 3);
check("registros", "cuenta los asientos con contenido", cr(RESPUESTA_CON_DATOS).total, 1);
check("registros", "un arreglo simple se cuenta por su longitud", cr([{ a: 1 }, { a: 2 }]).total, 2);
check("registros", "objeto suelto con datos cuenta como un asiento", cr({ nombre: "X" }).total, 1);
check("registros", "objeto suelto sin datos cuenta como cero", cr({ nombre: "", otro: null }).total, 0);
check("registros", "null cuenta como cero", cr(null).total, 0);

check("vigencia", "inactivo y vencido no es vigente",
  ev({ indicadorActivoIncopesca: false, fechaVenceIncopesca: anioPasado }).estado, "no-vigente");
check("vigencia", "activo pero vencido no es vigente",
  ev({ indicadorActivoIncopesca: true, fechaVenceIncopesca: anioPasado }).estado, "no-vigente");
check("vigencia", "inactivo aunque no haya vencido no es vigente",
  ev({ indicadorActivoIncopesca: false, fechaVenceIncopesca: anioFuturo }).estado, "no-vigente");
check("vigencia", "activo y sin vencer sí es vigente",
  ev({ indicadorActivoIncopesca: true, fechaVenceIncopesca: anioFuturo }).estado, "vigente");
check("vigencia", "sin indicadores no se afirma nada",
  ev({ nombrePermisonarioIncopesca: "X" }).estado, "desconocida");
check("vigencia", "el motivo explica por qué no está vigente",
  /inactivo y vencido/.test(ev({ indicadorActivoIncopesca: false, fechaVenceIncopesca: anioPasado }).motivo), true);
check("vigencia", "reconoce los campos del registro del MAG",
  ev({ indicadorActivoMAG: true, fechaVenceMAG: anioFuturo }).estado, "vigente");

/*
 * Estructura real del registro agropecuario. Los campos se llaman distinto
 * que en los permisos de pesca: la fecha de término es «fechaBajaMAG», no
 * «vence», y existe además «fechaAltaMAG», que es la fecha de inicio.
 * Confundirlas invertiría por completo el resultado.
 */
const ASIENTO_MAG = {
  nombreMAG: "NOMBRE DE EJEMPLO",
  estadoMAG: "Activo",
  fechaBajaMAG: anioFuturo,
  indicadorActivoMAG: true,
  fechaAltaMAG: anioPasado,
  fuenteMAG: "MAG"
};

check("vigencia", "asiento del MAG activo y sin vencer es vigente",
  ev(ASIENTO_MAG).estado, "vigente");
check("vigencia", "usa fechaBaja como vencimiento, no fechaAlta",
  ev({ ...ASIENTO_MAG, fechaBajaMAG: anioPasado, fechaAltaMAG: anioPasado }).estado, "no-vigente");
check("vigencia", "no confunde la fecha de alta con un vencimiento",
  /vence el/.test(ev(ASIENTO_MAG).motivo), true);
check("vigencia", "un estado textual desfavorable manda sobre el indicador",
  ev({ ...ASIENTO_MAG, estadoMAG: "Inactivo" }).estado, "no-vigente");
check("vigencia", "también reconoce «Vencido» en el texto del estado",
  ev({ ...ASIENTO_MAG, estadoMAG: "Vencido" }).estado, "no-vigente");
check("vigencia", "acepta «Vigente» como estado favorable",
  ev({ ...ASIENTO_MAG, estadoMAG: "Vigente" }).estado, "vigente");
check("vigencia", "el motivo cita el estado y la fecha",
  /Activo/.test(ev(ASIENTO_MAG).motivo), true);

check("registros", "cuenta dos asientos de fuentes distintas",
  cr({ listaDatosMAG: [ASIENTO_MAG, { ...ASIENTO_MAG, fuenteMAG: "SENASA" }] }).total, 2);
check("registros", "la respuesta del agropecuario trae una sola lista",
  cr({ listaDatosMAG: [ASIENTO_MAG] }).listas.length, 1);

check("etiquetas", "las tres listas tienen etiqueta propia",
  ["listaDatosMAG", "listaDatosIncopesca", "listaDatosAcuicultores"]
    .every((k) => typeof g("ETIQUETAS_REGISTRO")[k] === "string"), true);
check("etiquetas", "los campos de INCOPESCA tienen etiqueta legible",
  g("ETIQUETAS_REGISTRO").nombrePermisonarioIncopesca, "Nombre del permisionario");
check("etiquetas", "los seis campos del MAG tienen etiqueta legible",
  ["nombreMAG", "estadoMAG", "fechaAltaMAG", "fechaBajaMAG", "indicadorActivoMAG", "fuenteMAG"]
    .every((k) => typeof g("ETIQUETAS_REGISTRO")[k] === "string"), true);
check("etiquetas", "distingue «Inscrito el» de «Vence el»",
  [g("ETIQUETAS_REGISTRO").fechaAltaMAG, g("ETIQUETAS_REGISTRO").fechaBajaMAG],
  ["Inscrito el", "Vence el"]);

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

/* ======================= 11. PREFERENCIAS PERSISTIDAS ====================
 * Por el proxy pasan los números de identificación consultados y la duración
 * de la caché gobierna cuánto viven en memoria. Ambos valores se leen de
 * localStorage, que no es una fuente de confianza: puede traer restos de una
 * versión anterior o haber sido manipulado. Se validan igual que al guardarlos.
 */
const ps = g("proxyEsSeguro");
check("prefs", "acepta un proxy HTTPS", ps("https://mi-proxy.midominio.workers.dev"), true);
check("prefs", "acepta HTTP en localhost", ps("http://localhost:8787"), true);
check("prefs", "acepta HTTP en 127.0.0.1", ps("http://127.0.0.1:8787"), true);
check("prefs", "rechaza HTTP en un dominio ajeno", ps("http://ajeno.example"), false);
check("prefs", "rechaza el esquema javascript:", ps("javascript:alert(1)"), false);
check("prefs", "rechaza el esquema ftp:", ps("ftp://ajeno.example"), false);
check("prefs", "rechaza texto que no es una URL", ps("no-es-url"), false);
check("prefs", "rechaza la cadena vacía", ps(""), false);
check("prefs", "rechaza un valor no textual", ps(null), false);

const nt = g("normalizarTtl");
const TTL_PRED = g("TTL_PREDETERMINADO");
check("prefs", "conserva una duración del catálogo", nt(1800000), 1800000);
check("prefs", "conserva «sin caché» (0)", nt(0), 0);
// Un valor ajeno al catálogo dejaba el <select> sin opción marcada; al guardar,
// parseInt("") daba NaN y la caché se apagaba sin avisar.
check("prefs", "sustituye una duración fuera del catálogo", nt(123456), TTL_PRED);
check("prefs", "sustituye un valor negativo", nt(-1), TTL_PRED);
check("prefs", "sustituye un valor no numérico", nt("mucho rato"), TTL_PRED);
check("prefs", "sustituye undefined", nt(undefined), TTL_PRED);
check("prefs", "la duración predeterminada pertenece al catálogo",
  g("TTL_ADMITIDOS").includes(TTL_PRED), true);

/* ======================= 12. VIGENCIA: ORDEN Y RÓTULOS ===================
 * La columna «Vigencia» de las tablas de registro es un valor calculado, no un
 * campo de la fila. Sus rótulos y su orden viven en constantes compartidas para
 * que la tabla pueda ordenarla; sin ellas el encabezado no reordenaba nada.
 */
const EV = g("ETIQUETA_VIGENCIA");
check("vigencia", "rótulo de estado vigente", EV["vigente"], "Vigente");
check("vigencia", "rótulo de estado no vigente", EV["no-vigente"], "No vigente");
check("vigencia", "rótulo de estado desconocido", EV["desconocida"], "No determinable");
check("vigencia", "hay un rótulo por cada estado posible", Object.keys(EV).length, 3);

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
