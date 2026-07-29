/**
 * ============================================================================
 * PROXY OPCIONAL — Node.js (sin dependencias externas)
 * Verificador Hacienda CR
 * ============================================================================
 *
 * Alternativa al Cloudflare Worker para quien prefiera ejecutar el proxy en
 * un servidor propio, en una máquina local o en cualquier plataforma que
 * admita Node.js (Render, Railway, Fly.io, un VPS, etc.).
 *
 * Requisitos: Node.js 18 o superior (incorpora fetch de forma nativa).
 *
 * USO
 * ---
 *   node server.js
 *   node server.js --port 8787
 *   PORT=8787 node server.js
 *
 * Después, en la aplicación abra "Configuración avanzada" y escriba
 * http://localhost:8787 en el campo "URL de su propio proxy".
 *
 * Motivo de su existencia: las respuestas 400 y 404 de api.hacienda.go.cr no
 * incluyen cabeceras CORS, por lo que el navegador no puede leer su cuerpo.
 * Este proxy reenvía la respuesta íntegra añadiendo dichas cabeceras.
 * No modifica los datos ni almacena las consultas.
 * ============================================================================
 */

"use strict";

const http = require("node:http");
const { URL } = require("node:url");

const API_ORIGEN = "https://api.hacienda.go.cr";

/** Rutas admitidas; cualquier otra se rechaza con 403. */
const RUTAS_PERMITIDAS = new Set([
  "/fe/ae",
  "/fe/ex",
  "/fe/agropecuario",
  "/fe/pesca",
  "/fe/cabys",
  "/indicadores/tc",
  "/indicadores/tc/dolar",
  "/indicadores/tc/dolar/historico",
  "/indicadores/tc/euro"
]);

/** Parámetros de consulta admitidos por la API oficial. */
const PARAMS_PERMITIDOS = new Set(["identificacion", "autorizacion", "codigo", "q", "top", "d", "h"]);

/**
 * Orígenes autorizados.
 *  · "*"    → cualquiera (cómodo en local, no recomendado si se publica)
 *  · Lista  → ["https://miusuario.github.io"]
 */
const ORIGENES_PERMITIDOS = ["*"];

/**
 * Limitador de ritmo del propio proxy: protege la dirección IP del servidor
 * frente a los umbrales oficiales (20 solicitudes/s en ráfaga, 10/s sostenidas).
 * Se aplica un máximo conservador de 5 solicitudes por segundo.
 */
const LIMITE_POR_SEGUNDO = 5;
let ventanaInicio = Date.now();
let contadorVentana = 0;

function dentroDelLimite() {
  const ahora = Date.now();
  if (ahora - ventanaInicio >= 1000) { ventanaInicio = ahora; contadorVentana = 0; }
  if (contadorVentana >= LIMITE_POR_SEGUNDO) return false;
  contadorVentana++;
  return true;
}

function resolverOrigen(req) {
  const origen = req.headers.origin;
  if (ORIGENES_PERMITIDOS.includes("*")) return "*";
  if (origen && ORIGENES_PERMITIDOS.includes(origen)) return origen;
  return null;
}

function cabecerasCors(origen) {
  return {
    "Access-Control-Allow-Origin": origen || "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function responderJson(res, status, cuerpo, origen) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(texto),
    "Cache-Control": "no-store",
    ...cabecerasCors(origen)
  });
  res.end(texto);
}

const servidor = http.createServer(async (req, res) => {
  const origen = resolverOrigen(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, cabecerasCors(origen));
    res.end();
    return;
  }

  if (req.method !== "GET") {
    responderJson(res, 405, { code: 405, status: "Método no permitido. Este proxy sólo admite GET.", proxy: true }, origen);
    return;
  }

  if (!origen) {
    responderJson(res, 403, { code: 403, status: "Origen no autorizado para utilizar este proxy.", proxy: true }, origen);
    return;
  }

  const url = new URL(req.url, "http://localhost");

  // Comprobación de salud, útil para plataformas de despliegue
  if (url.pathname === "/salud" || url.pathname === "/health") {
    responderJson(res, 200, { code: 200, status: "OK", proxy: "VerificadorHaciendaCR" }, origen);
    return;
  }

  const ruta = url.pathname.replace(/\/+$/, "") || "/";
  if (!RUTAS_PERMITIDAS.has(ruta)) {
    responderJson(res, 403, { code: 403, status: `Ruta no permitida: ${ruta}`, proxy: true }, origen);
    return;
  }

  if (!dentroDelLimite()) {
    res.writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Retry-After": "2", ...cabecerasCors(origen) });
    res.end(JSON.stringify({ code: 429, status: "Límite de ritmo del proxy alcanzado. Reintente en unos segundos.", proxy: true }));
    return;
  }

  const destino = new URL(API_ORIGEN + ruta);
  for (const [clave, valor] of url.searchParams) {
    if (PARAMS_PERMITIDOS.has(clave)) destino.searchParams.set(clave, valor);
  }

  try {
    const ctrl = new AbortController();
    const temporizador = setTimeout(() => ctrl.abort(), 30000);

    const respuesta = await fetch(destino.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "VerificadorHaciendaCR-Proxy/1.0" },
      signal: ctrl.signal
    });
    clearTimeout(temporizador);

    const buffer = Buffer.from(await respuesta.arrayBuffer());
    res.writeHead(respuesta.status, {
      "Content-Type": respuesta.headers.get("content-type") || "application/json; charset=utf-8",
      "Content-Length": buffer.length,
      "Cache-Control": "no-store",
      "X-Proxy-Upstream-Status": String(respuesta.status),
      ...cabecerasCors(origen)
    });
    res.end(buffer);
  } catch (e) {
    const esTimeout = e && e.name === "AbortError";
    responderJson(res, esTimeout ? 504 : 502, {
      code: esTimeout ? 504 : 502,
      status: esTimeout
        ? "El servicio del Ministerio de Hacienda no respondió a tiempo."
        : "No fue posible contactar al servicio del Ministerio de Hacienda.",
      proxy: true
    }, origen);
  }
});

// Puerto: --port N, variable PORT, o 8787 por omisión
const argPort = process.argv.indexOf("--port");
const PUERTO = argPort > -1 ? Number(process.argv[argPort + 1])
             : Number(process.env.PORT) || 8787;

servidor.listen(PUERTO, () => {
  console.log(`Proxy del Verificador Hacienda CR escuchando en http://localhost:${PUERTO}`);
  console.log(`Comprobación de salud: http://localhost:${PUERTO}/salud`);
  console.log("Rutas permitidas:", [...RUTAS_PERMITIDAS].join(", "));
});
