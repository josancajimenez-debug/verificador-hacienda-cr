/**
 * ============================================================================
 * PROXY OPCIONAL — Cloudflare Worker
 * Verificador Hacienda CR
 * ============================================================================
 *
 * ¿POR QUÉ EXISTE ESTE ARCHIVO?
 * -----------------------------
 * La aplicación funciona SIN proxy. Se verificó que api.hacienda.go.cr
 * devuelve la cabecera `Access-Control-Allow-Origin: *` en sus respuestas
 * correctas (código 200), por lo que un navegador puede consultarla
 * directamente desde un archivo index.html publicado en GitHub Pages.
 *
 * Sin embargo, existe una limitación real y verificable: las respuestas de
 * error 400 (parámetro inválido) y 404 (registro inexistente) las sirve la
 * capa estática de Akamai y NO incluyen esa cabecera. Como consecuencia, el
 * navegador bloquea la lectura del cuerpo y `fetch()` falla con un TypeError
 * indistinguible de una caída de red.
 *
 * La aplicación resuelve esto con una sonda de conectividad, lo que es
 * suficiente para mostrar un mensaje correcto. Este proxy es una mejora
 * OPCIONAL: reenvía la respuesta original añadiendo las cabeceras CORS, de
 * modo que el navegador reciba el código 400 o 404 exacto y el mensaje del
 * Ministerio, sin necesidad de la sonda.
 *
 * QUÉ HACE Y QUÉ NO HACE
 * ----------------------
 *  · Sólo reenvía peticiones GET a rutas de una lista blanca.
 *  · No modifica el cuerpo de la respuesta.
 *  · No registra ni almacena los parámetros consultados.
 *  · No desactiva ningún mecanismo de seguridad del navegador: se limita a
 *    declarar explícitamente que este proxy, propiedad de quien lo despliega,
 *    autoriza la lectura desde el navegador.
 *
 * PUBLICACIÓN
 * -----------
 *   1. Cree una cuenta gratuita en https://dash.cloudflare.com
 *   2. Workers & Pages → Create → Worker → asígnele un nombre.
 *   3. Pulse "Edit code", pegue este archivo completo y despliegue ("Deploy").
 *   4. Copie la URL resultante (https://NOMBRE.SUCUENTA.workers.dev).
 *   5. En la aplicación, abra "Configuración avanzada" y péguela en el campo
 *      "URL de su propio proxy". Guarde.
 *
 * SEGURIDAD: ajuste ORIGENES_PERMITIDOS a los dominios donde publique la
 * aplicación para que nadie más pueda utilizar su proxy.
 * ============================================================================
 */

/** Origen real del Ministerio de Hacienda. No debe modificarse. */
const API_ORIGEN = "https://api.hacienda.go.cr";

/**
 * Rutas admitidas. Cualquier otra ruta se rechaza con 403.
 * Evita que el proxy se convierta en un reenviador abierto.
 */
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

/**
 * Orígenes autorizados a usar este proxy.
 *  · ["*"]  → cualquiera (cómodo para pruebas, no recomendado en producción)
 *  · Lista  → sólo esos dominios, por ejemplo:
 *             ["https://miusuario.github.io", "http://localhost:8080"]
 */
const ORIGENES_PERMITIDOS = ["*"];

/** Parámetros de consulta admitidos por la API oficial. */
const PARAMS_PERMITIDOS = new Set(["identificacion", "autorizacion", "codigo", "q", "top", "d", "h"]);

/** Resuelve el valor de Access-Control-Allow-Origin para la petición. */
function origenPermitido(request) {
  const origen = request.headers.get("Origin");
  if (ORIGENES_PERMITIDOS.includes("*")) return "*";
  if (origen && ORIGENES_PERMITIDOS.includes(origen)) return origen;
  return null;
}

/** Cabeceras CORS comunes a todas las respuestas del proxy. */
function cabecerasCors(origen) {
  return {
    "Access-Control-Allow-Origin": origen || "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

/** Respuesta JSON de error generada por el propio proxy. */
function errorJson(status, mensaje, origen) {
  return new Response(JSON.stringify({ code: status, status: mensaje, proxy: true }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cabecerasCors(origen) }
  });
}

export default {
  async fetch(request) {
    const origen = origenPermitido(request);

    // --- Preflight CORS -----------------------------------------------
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cabecerasCors(origen) });
    }

    if (request.method !== "GET") {
      return errorJson(405, "Método no permitido. Este proxy sólo admite GET.", origen);
    }

    if (!origen) {
      return errorJson(403, "Origen no autorizado para utilizar este proxy.", origen);
    }

    const url = new URL(request.url);

    // --- Lista blanca de rutas ----------------------------------------
    const ruta = url.pathname.replace(/\/+$/, "") || "/";
    if (!RUTAS_PERMITIDAS.has(ruta)) {
      return errorJson(403, `Ruta no permitida: ${ruta}`, origen);
    }

    // --- Reconstrucción de la consulta con parámetros filtrados --------
    const destino = new URL(API_ORIGEN + ruta);
    for (const [clave, valor] of url.searchParams) {
      if (PARAMS_PERMITIDOS.has(clave)) destino.searchParams.set(clave, valor);
    }

    // --- Reenvío ------------------------------------------------------
    let respuesta;
    try {
      respuesta = await fetch(destino.toString(), {
        method: "GET",
        headers: { "Accept": "application/json", "User-Agent": "VerificadorHaciendaCR-Proxy/1.0" },
        redirect: "follow",
        cf: { cacheTtl: 0, cacheEverything: false }
      });
    } catch (e) {
      return errorJson(502, "No fue posible contactar al servicio del Ministerio de Hacienda.", origen);
    }

    // Se conserva el código y el cuerpo original; sólo se añaden las
    // cabeceras CORS y se evita el almacenamiento en caché intermedia.
    const cuerpo = await respuesta.arrayBuffer();
    const headers = new Headers(cabecerasCors(origen));
    headers.set("Content-Type", respuesta.headers.get("Content-Type") || "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Proxy-Upstream-Status", String(respuesta.status));

    return new Response(cuerpo, { status: respuesta.status, headers });
  }
};
