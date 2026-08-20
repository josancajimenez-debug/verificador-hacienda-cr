/**
 * Ayuda compartida para los bancos "sin red" (comportamiento, estructura,
 * recorrido, navegador, calidad): como toda la app ahora vive detrás de la
 * membresía, estos bancos necesitan una sesión para llegar al contenido que
 * ya auditaban — pero sin depender de un proyecto Supabase real, porque su
 * razón de ser es no tocar red.
 *
 * La solución es simular el SDK de Supabase por completo con
 * page.route(): se sirve index.html con un proyecto de mentira
 * (URL_SIMULADA) y se intercepta cualquier llamada a ese dominio con
 * respuestas fijas, sin salir jamás a Internet real.
 */
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const URL_SIMULADA = "https://verificador-test.supabase.co";
const ANON_KEY_SIMULADA = "clave-simulada-anonima";
const REF_SIMULADA = "verificador-test";

/** Devuelve el contenido de index.html con el proyecto simulado en vez de los marcadores PENDIENTE_*. */
function htmlConSupabaseSimulado(rutaIndex) {
  const original = fs.readFileSync(rutaIndex, "utf8");
  const parcheado = original
    .replace('"PENDIENTE_SUPABASE_URL"', JSON.stringify(URL_SIMULADA))
    .replace('"PENDIENTE_SUPABASE_ANON_KEY"', JSON.stringify(ANON_KEY_SIMULADA));
  if (parcheado === original) {
    throw new Error("No se encontraron los marcadores PENDIENTE_SUPABASE_* en index.html");
  }
  return parcheado;
}

/**
 * Prepara la página para arrancar con una sesión ya activa, sin red real.
 * Debe llamarse ANTES de p.setContent()/p.goto().
 *
 * @param {import('playwright').Page} page
 * @param {{role?: "member"|"admin", vigente?: boolean}} opciones
 */
async function simularSesionMiembro(page, { role = "member", vigente = true } = {}) {
  const sesion = {
    access_token: "token-simulado",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "refresh-simulado",
    user: {
      id: "00000000-0000-4000-8000-000000000001",
      email: "miembro-simulado@example.com",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {}
    }
  };
  const perfil = {
    membership_expires_at: new Date(Date.now() + (vigente ? 20 : -1) * 86400000).toISOString(),
    role
  };

  await page.route(`${URL_SIMULADA}/auth/v1/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sesion) }));

  await page.route(`${URL_SIMULADA}/rest/v1/profiles**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(perfil) }));

  await page.route(`${URL_SIMULADA}/rest/v1/payments**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));

  await page.route(`${URL_SIMULADA}/rest/v1/rpc/confirm_payment`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }));

  // El SDK de Supabase restaura la sesión leyendo su propia clave de
  // localStorage al inicializarse; se preinyecta con addInitScript para que
  // exista antes de que se ejecute el <script> principal de la página.
  await page.addInitScript(
    ([ref, sesionJson]) => localStorage.setItem(`sb-${ref}-auth-token`, sesionJson),
    [REF_SIMULADA, JSON.stringify(sesion)]
  );
}

/**
 * Navega a index.html (como file://, para conservar el mismo origen que usa
 * el resto de la suite — imprescindible para crypto.subtle y localStorage,
 * que un about:blank de page.setContent() no concede) sirviendo el
 * contenido parcheado con el proyecto simulado, y con la sesión ya
 * inyectada. Sustituye al p.goto(APP) que usaban estos bancos antes de que
 * la app quedara detrás de la membresía.
 *
 * @param {import('playwright').Page} page
 * @param {string} rutaIndex
 * @param {{role?: "member"|"admin", vigente?: boolean}} [opciones]
 * @returns {Promise<string>} la URL file:// usada
 */
async function cargarConSesionSimulada(page, rutaIndex, opciones) {
  const fileURL = pathToFileURL(rutaIndex).href;
  await page.route(fileURL, (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: htmlConSupabaseSimulado(rutaIndex)
  }));
  await simularSesionMiembro(page, opciones);
  await page.goto(fileURL, { waitUntil: "load" });
  return fileURL;
}

module.exports = {
  htmlConSupabaseSimulado, simularSesionMiembro, cargarConSesionSimulada,
  URL_SIMULADA, ANON_KEY_SIMULADA
};
