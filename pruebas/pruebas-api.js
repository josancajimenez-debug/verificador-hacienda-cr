/**
 * Prueba de INTEGRACIÓN: ejercita la capa HTTP real de index.html
 * (apiGet: caché, deduplicación, limitador de ritmo, reintentos y
 * clasificación de errores) contra los servicios oficiales del
 * Ministerio de Hacienda de Costa Rica.
 *
 * Se limita deliberadamente el número de llamadas para respetar los
 * umbrales publicados (20/s en ráfaga, 10/s sostenidas).
 */
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");

const HTML = process.argv[2];
const src = fs.readFileSync(HTML, "utf8").match(/<script>([\s\S]*?)<\/script>/)[1];

function fakeElement(tag = "div") {
  return {
    tagName: tag.toUpperCase(), children: [], childNodes: [], firstChild: null,
    style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
    attributes: {}, _text: "",
    get textContent(){ return this._text }, set textContent(v){ this._text = String(v) },
    value: "", checked: false, hidden: false, disabled: false, tabIndex: 0, max: "",
    appendChild(c){ this.children.push(c); return c }, removeChild(c){ return c },
    setAttribute(k,v){ this.attributes[k]=String(v) }, getAttribute(k){ return this.attributes[k] ?? null },
    removeAttribute(k){ delete this.attributes[k] },
    addEventListener(){}, focus(){}, click(){}, select(){},
    querySelector(){ return null }, querySelectorAll(){ return [] }, reset(){}
  };
}

const sandbox = {
  console: { info(){}, warn(){}, error(){}, log(){} },
  document: {
    documentElement: fakeElement("html"), body: fakeElement("body"), readyState: "complete",
    createElement: (t) => fakeElement(t), createTextNode: (t) => ({ textContent: String(t) }),
    getElementById: () => fakeElement(), querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, execCommand: () => true
  },
  window: { isSecureContext: false, addEventListener(){} },
  navigator: { onLine: true, clipboard: null },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  fetch: globalThis.fetch.bind(globalThis),          // fetch REAL de Node 18+
  AbortController, URL, URLSearchParams, Blob: class {}, Intl, Date, Math, JSON,
  setTimeout, clearTimeout, Promise, TypeError, Error
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "index.html:script" });

const apiGet = sandbox.apiGet;
const RUTAS  = vm.runInContext("RUTAS", sandbox);

let ok = 0, ko = 0;
const filas = [];

async function caso(nombre, fn, comprobar) {
  const t0 = Date.now();
  let resultado, error = null;
  try { resultado = await fn(); }
  catch (e) { error = e; }
  const ms = Date.now() - t0;
  let veredicto;
  try { veredicto = comprobar(resultado, error); }
  catch (e) { veredicto = { ok: false, nota: "excepción en la comprobación: " + e.message }; }
  veredicto.ok ? ok++ : ko++;
  filas.push({ nombre, ok: veredicto.ok, nota: veredicto.nota, ms });
  console.log(`${veredicto.ok ? "✓" : "✗"} ${nombre.padEnd(58)} ${String(ms).padStart(5)} ms  — ${veredicto.nota}`);
}

(async () => {
  console.log("\nPRUEBAS DE INTEGRACIÓN CONTRA api.hacienda.go.cr\n" + "=".repeat(96));

  // ---- Módulo 1: situación tributaria ----------------------------------
  await caso("M1 /fe/ae · contribuyente existente (4000042139)",
    () => apiGet(RUTAS.ae, { identificacion: "4000042139" }),
    (r, e) => e ? { ok: false, nota: "error inesperado: " + e.kind }
                : { ok: typeof r.nombre === "string" && Array.isArray(r.actividades),
                    nota: `nombre="${r.nombre}", régimen="${r.regimen?.descripcion}", actividades=${r.actividades.length}` });

  await caso("M1 /fe/ae · contribuyente desinscrito con mensaje oficial",
    () => apiGet(RUTAS.ae, { identificacion: "3101012386" }),
    (r, e) => e ? { ok: false, nota: "error inesperado: " + e.kind }
                : { ok: r.situacion?.estado === "Desinscrito oficio",
                    nota: `estado="${r.situacion?.estado}", mensaje presente=${Boolean(r.situacion?.mensaje)}` });

  await caso("M1 /fe/ae · identificación inexistente → not-found",
    () => apiGet(RUTAS.ae, { identificacion: "3101002949" }),
    (r, e) => ({ ok: e?.kind === "not-found", nota: `kind="${e?.kind}", HTTP ${e?.status}` }));

  // Parámetro ausente: el recurso oficial es inestable en este caso concreto.
  // El 29/07/2026 devolvía 400; horas después dejó de responder por completo
  // (4 de 4 comprobaciones con curl agotaron 25 s sin respuesta). Lo que esta
  // prueba verifica, por tanto, no es un código HTTP concreto sino algo que sí
  // está bajo control de la aplicación: que cualquiera de los dos desenlaces se
  // convierta en un error TIPIFICADO y nunca en una excepción sin clasificar.
  // En el navegador este caso es inalcanzable: la validación exige de 9 a 12
  // dígitos antes de enviar la solicitud.
  await caso("M1 /fe/ae · parámetro ausente → error tipificado, sin excepción",
    () => apiGet(RUTAS.ae, {}, { timeout: 12000, maxRetries: 0 }),
    (r, e) => ({
      ok: e instanceof Error && typeof e.kind === "string" &&
          ["bad-request", "timeout", "network", "sin-resultado"].includes(e.kind),
      nota: `kind="${e?.kind}", HTTP ${e?.status ?? "sin respuesta"} — traducido a un mensaje comprensible`
    }));

  await caso("M1 /fe/ae · identificación con 0 inicial → bad-request (regla verificada)",
    () => apiGet(RUTAS.ae, { identificacion: "012345678" }, { maxRetries: 0 }),
    (r, e) => ({ ok: e?.kind === "bad-request",
                 nota: `kind="${e?.kind}", HTTP ${e?.status} — la app lo bloquea antes de llegar aquí` }));

  // ---- Módulo 2: tipo de cambio ----------------------------------------
  await caso("M2 /indicadores/tc/dolar · tipo de cambio vigente",
    () => apiGet(RUTAS.tcDolar, {}),
    (r, e) => e ? { ok: false, nota: "error inesperado: " + e.kind }
                : { ok: typeof r.compra?.valor === "number" && typeof r.venta?.valor === "number",
                    nota: `fecha=${r.compra?.fecha}, compra=${r.compra?.valor}, venta=${r.venta?.valor}` });

  await caso("M2 · caché: segunda llamada idéntica no genera tráfico",
    async () => { const t = Date.now(); await apiGet(RUTAS.tcDolar, {}); return Date.now() - t; },
    (r) => ({ ok: r < 40, nota: `resuelta en ${r} ms desde la caché en memoria` }));


  // ---- Módulo 3: exoneraciones -----------------------------------------
  await caso("M3 /fe/ex · autorización válida (AL-00460853-20)",
    () => apiGet(RUTAS.ex, { autorizacion: "AL-00460853-20" }),
    (r, e) => e ? { ok: false, nota: "error inesperado: " + e.kind }
                : { ok: r.numeroDocumento === "AL-00460853-20",
                    nota: `doc=${r.numeroDocumento}, exoneración=${r.porcentajeExoneracion}%, institución="${r.nombreInstitucion}"` });

  await caso("M3 /fe/ex · autorización inexistente → not-found",
    () => apiGet(RUTAS.ex, { autorizacion: "AL-01234567-89" }),
    (r, e) => ({ ok: e?.kind === "not-found", nota: `kind="${e?.kind}", HTTP ${e?.status}` }));

  await caso("M3 /fe/ex · formato rechazado por la API → bad-request",
    () => apiGet(RUTAS.ex, { autorizacion: "AL-0460853-20" }),
    (r, e) => ({ ok: e?.kind === "bad-request", nota: `kind="${e?.kind}", HTTP ${e?.status}` }));

  // ---- Módulo 4 y 5: agropecuario y pesca ------------------------------
  await caso("M4 /fe/agropecuario · HTTP 200 con cuerpo 404 → not-found",
    () => apiGet(RUTAS.agropecuario, { identificacion: "2100042005" }),
    (r, e) => ({ ok: e?.kind === "not-found",
                 nota: `error incrustado detectado pese al HTTP 200; kind="${e?.kind}"` }));

  await caso("M5 /fe/pesca · HTTP 200 con cuerpo 404 → not-found",
    () => apiGet(RUTAS.pesca, { identificacion: "2100042005" }),
    (r, e) => ({ ok: e?.kind === "not-found",
                 nota: `error incrustado detectado pese al HTTP 200; kind="${e?.kind}"` }));

  // ---- Módulo 6: CABYS --------------------------------------------------
  await caso("M6 /fe/cabys · búsqueda por código (2132100000100)",
    () => apiGet(RUTAS.cabys, { codigo: "2132100000100" }),
    (r, e) => e ? { ok: false, nota: "error inesperado: " + e.kind }
                : { ok: Array.isArray(r) && r.length === 1 && r[0].codigo === "2132100000100",
                    nota: `descripción="${r[0]?.descripcion}", IVA=${r[0]?.impuesto}%` });

  await caso("M6 /fe/cabys · búsqueda por descripción con top",
    () => apiGet(RUTAS.cabys, { q: "jugo de tomate", top: 3 }),
    (r, e) => e ? { ok: false, nota: "error inesperado: " + e.kind }
                : { ok: Array.isArray(r.cabys) && r.cabys.length <= 3,
                    nota: `total=${r.total}, devueltos=${r.cantidad}` });

  await caso("M6 /fe/cabys · código inexistente devuelve arreglo vacío",
    () => apiGet(RUTAS.cabys, { codigo: "1111111111111" }),
    (r, e) => e ? { ok: false, nota: "error inesperado: " + e.kind }
                : { ok: Array.isArray(r) && r.length === 0, nota: "[] — la interfaz lo presenta como «Sin coincidencias»" });

  // ---- Deduplicación de solicitudes simultáneas -------------------------
  await caso("HTTP · dos llamadas simultáneas idénticas comparten una sola solicitud",
    async () => {
      vm.runInContext("cache.clear()", sandbox);
      const a = apiGet(RUTAS.cabys, { codigo: "2312000000300" });
      const b = apiGet(RUTAS.cabys, { codigo: "2312000000300" });
      const [ra, rb] = await Promise.all([a, b]);
      return ra === rb;   // misma referencia = misma promesa reutilizada
    },
    (r) => ({ ok: r === true, nota: r ? "una única solicitud de red (protege contra el doble clic)" : "se generaron dos solicitudes" }));

  console.log("=".repeat(96));
  console.log(`TOTAL: ${ok} superadas, ${ko} fallidas`);
  process.exit(ko === 0 ? 0 : 1);
})();
