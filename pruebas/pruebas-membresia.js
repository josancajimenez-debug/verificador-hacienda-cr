/**
 * Auditoría de la membresía mensual: registro, confirmación de correo,
 * bloqueo de acceso sin pago confirmado, envío de referencia de pago,
 * confirmación por un administrador y reactivación del acceso.
 *
 * A diferencia del resto de la suite, este banco SÍ toca red real: habla
 * con un proyecto Supabase dedicado exclusivamente a pruebas (nunca el de
 * producción). Requiere tres variables de entorno:
 *
 *   SUPABASE_TEST_URL              URL del proyecto de pruebas
 *   SUPABASE_TEST_ANON_KEY         anon key del proyecto de pruebas
 *   SUPABASE_TEST_SERVICE_ROLE_KEY service role key del proyecto de pruebas
 *
 * La service role key sólo se usa aquí, del lado de Node (para crear/borrar
 * usuarios de prueba y confirmar su correo sin depender de un buzón real);
 * nunca se inyecta en la página que controla Playwright.
 *
 * El proyecto debe tener aplicado supabase/schema.sql antes de ejecutar
 * este banco.
 */
const SUPABASE_TEST_URL = process.env.SUPABASE_TEST_URL;
const SUPABASE_TEST_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;
const SUPABASE_TEST_SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

if (!SUPABASE_TEST_URL || !SUPABASE_TEST_ANON_KEY || !SUPABASE_TEST_SERVICE_ROLE_KEY) {
  // Comprobación deliberadamente anterior a los require() de playwright/
  // @supabase/supabase-js: así este banco se puede omitir con un aviso
  // claro incluso antes de instalar esas dependencias.
  console.log(
    "AUDITORÍA DE MEMBRESÍA\n" + "=".repeat(96) +
    "\nSe omite: faltan SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY o SUPABASE_TEST_SERVICE_ROLE_KEY.\n" +
    "Cree un proyecto Supabase dedicado a pruebas, aplique supabase/schema.sql y exporte las tres\n" +
    "variables antes de ejecutar este banco (ver README, sección de membresía).\n" +
    "=".repeat(96)
  );
  process.exit(0);
}

const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("node:fs");
const path = require("node:path");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Hacienda-CR-1262!";
const CONTRASENA_PRUEBA = "PruebaMembresia-2026!";
const SUFIJO = Date.now();
const CORREO_MIEMBRO = `verificador-test-miembro-${SUFIJO}@example.com`;
const CORREO_ADMIN = `verificador-test-admin-${SUFIJO}@example.com`;

const admin = createClient(SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let ok = 0, ko = 0;
function check(n, c, nota) { c ? ok++ : ko++; console.log(`${c ? "✓" : "✗"} ${n.padEnd(58)} — ${nota}`); }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirNavegador(opciones = {}) {
  try { return await chromium.launch({ channel: "chrome", ...opciones }); }
  catch { return await chromium.launch(opciones); }
}

/** Sirve index.html con los marcadores de Supabase sustituidos por el proyecto de pruebas. */
function htmlParaPruebas(rutaIndex) {
  const original = fs.readFileSync(rutaIndex, "utf8");
  const parcheado = original
    .replace('"PENDIENTE_SUPABASE_URL"', JSON.stringify(SUPABASE_TEST_URL))
    .replace('"PENDIENTE_SUPABASE_ANON_KEY"', JSON.stringify(SUPABASE_TEST_ANON_KEY));
  if (parcheado === original) {
    throw new Error("No se encontraron los marcadores PENDIENTE_SUPABASE_* en index.html");
  }
  return parcheado;
}

async function borrarUsuarioPorCorreo(correo) {
  const { data } = await admin.auth.admin.listUsers();
  const usuario = (data?.users || []).find((u) => u.email === correo);
  if (usuario) await admin.auth.admin.deleteUser(usuario.id);
}

(async () => {
  const rutaIndex = path.resolve(process.argv[2] || "index.html");
  const html = htmlParaPruebas(rutaIndex);

  const b = await abrirNavegador();
  const contexto = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CR" });
  const p = await contexto.newPage();

  console.log("\nAUDITORÍA DE MEMBRESÍA\n" + "=".repeat(96));

  try {
    // ---------- Preparar un administrador de prueba ----------
    const { data: altaAdmin, error: errAltaAdmin } = await admin.auth.admin.createUser({
      email: CORREO_ADMIN, password: CONTRASENA_PRUEBA, email_confirm: true
    });
    check("Se puede crear un usuario administrador de prueba", !errAltaAdmin && !!altaAdmin?.user,
      errAltaAdmin ? errAltaAdmin.message : `id=${altaAdmin.user.id}`);
    if (altaAdmin?.user) {
      const { error: errRol } = await admin.from("profiles").update({ role: "admin" }).eq("id", altaAdmin.user.id);
      check("Se le puede asignar role=admin desde el servidor", !errRol, errRol ? errRol.message : "role=admin");
    }

    // ---------- Registro de un nuevo miembro ----------
    await p.setContent(html, { waitUntil: "load" });
    await esperar(500);

    await p.click("#ir-registro");
    await p.fill("#reg-nombre", "Persona de Prueba");
    await p.fill("#reg-cedula", "0123456789");
    await p.fill("#reg-telefono", "88887777");
    await p.fill("#reg-correo", CORREO_MIEMBRO);
    await p.fill("#reg-password", CONTRASENA_PRUEBA);
    await p.click("#registro-submit");
    await esperar(1200);
    check("Tras registrarse se pide confirmar el correo",
      await p.locator("#portal-confirmar").isVisible(), "pantalla portal-confirmar visible");

    // Confirma el correo del lado del servidor (no hay buzón real en pruebas).
    const { data: listado } = await admin.auth.admin.listUsers();
    const miembro = (listado?.users || []).find((u) => u.email === CORREO_MIEMBRO);
    check("El registro creó el usuario en Supabase Auth", !!miembro, miembro ? `id=${miembro.id}` : "no aparece en listUsers()");
    if (miembro) await admin.auth.admin.updateUserById(miembro.id, { email_confirm: true });

    // ---------- Ingreso sin membresía pagada: debe quedar bloqueado ----------
    await p.click("#confirmar-ir-login");
    await p.fill("#login-email", CORREO_MIEMBRO);
    await p.fill("#login-password", CONTRASENA_PRUEBA);
    await p.click("#login-submit");
    await esperar(1200);
    check("Sin pago confirmado, el verificador permanece oculto",
      await p.locator("#contenido").isHidden(), "contenido hidden=true");
    check("Se muestra la pantalla de estado con el aviso de pago pendiente",
      await p.locator("#portal-estado").isVisible(), "portal-estado visible");

    // ---------- Envío de referencia de pago ----------
    await p.click("#estado-registrar-pago");
    await p.selectOption("#pago-medio", "sinpe");
    await p.fill("#pago-referencia", `SINPE-${SUFIJO}`);
    await p.click("#pago-submit");
    await esperar(1200);
    const { data: pagos } = await admin.from("payments").select("id, estado").eq("user_id", miembro?.id || "");
    check("La referencia de pago queda registrada como pendiente",
      Array.isArray(pagos) && pagos.length === 1 && pagos[0].estado === "pendiente",
      pagos ? JSON.stringify(pagos) : "sin datos");
    check("Sigue sin acceso mientras el pago no se confirme",
      await p.locator("#contenido").isHidden(), "contenido hidden=true");

    // ---------- Un administrador confirma el pago desde el panel ----------
    await p.fill("#login-email", CORREO_ADMIN);
    await p.fill("#login-password", CONTRASENA_PRUEBA);
    await p.click("#login-submit");
    await esperar(1000);

    await p.click("#btn-admin");
    await p.fill("#admin-password", ADMIN_PASSWORD);
    await p.click("#admin-submit");
    await esperar(800);
    check("La contraseña admin revela el panel de membresías",
      await p.locator("#membresia-admin").isVisible({ timeout: 2000 }).catch(() => false), "membresia-admin visible");

    const filaPago = p.locator("#membresia-pago-lista .dl__item--full", { hasText: `SINPE-${SUFIJO}` });
    check("El pago del miembro aparece en la cola de confirmación",
      await filaPago.count() > 0, `${await filaPago.count()} fila(s) encontradas`);
    if (await filaPago.count() > 0) {
      await filaPago.getByRole("button", { name: "Confirmar" }).click();
      await esperar(1000);
    }

    const { data: pagoConfirmado } = await admin.from("payments").select("estado, periodo_fin").eq("user_id", miembro?.id || "").single();
    check("confirm_payment marcó el pago como confirmado",
      pagoConfirmado?.estado === "confirmado", pagoConfirmado ? JSON.stringify(pagoConfirmado) : "sin datos");

    const { data: perfilTrasConfirmar } = await admin.from("profiles").select("membership_expires_at").eq("id", miembro?.id || "").single();
    const vigente = perfilTrasConfirmar?.membership_expires_at && new Date(perfilTrasConfirmar.membership_expires_at) > new Date();
    check("El perfil queda con una fecha de vencimiento futura", !!vigente,
      perfilTrasConfirmar ? String(perfilTrasConfirmar.membership_expires_at) : "sin datos");

    // ---------- El miembro ya reactivado recupera el acceso ----------
    await p.click("#btn-logout-member");
    await esperar(500);
    await p.fill("#login-email", CORREO_MIEMBRO);
    await p.fill("#login-password", CONTRASENA_PRUEBA);
    await p.click("#login-submit");
    await esperar(1200);
    check("Tras la confirmación, el verificador queda visible",
      await p.locator("#contenido").isVisible(), "contenido visible=true");
    check("El portal de acceso se oculta una vez dentro",
      await p.locator("#portal-membresia").isHidden(), "portal-membresia hidden=true");
  } finally {
    await b.close().catch(() => {});
    await borrarUsuarioPorCorreo(CORREO_MIEMBRO).catch(() => {});
    await borrarUsuarioPorCorreo(CORREO_ADMIN).catch(() => {});
  }

  console.log("=".repeat(96));
  console.log(`TOTAL: ${ok} superadas, ${ko} fallidas`);
  process.exit(ko > 0 ? 1 : 0);
})();
