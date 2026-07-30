/**
 * Recorrido exhaustivo en navegador real: ejercita todos los flujos de la
 * aplicación y no admite ni un solo error o advertencia en la consola, ni
 * rechazos de promesa sin gestionar.
 */
const { chromium } = require("playwright");
const path = require("node:path");
const APP = require("node:url").pathToFileURL(path.resolve(process.argv[2])).href;

/* Contraseña administrativa con la que se publica la aplicación. Si usted la
   cambia siguiendo el README, exporte ADMIN_PASSWORD antes de ejecutar el banco. */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin-ACC-2026!";

/**
 * Abre Google Chrome si está instalado y, si no, el Chromium que incluye
 * Playwright. Así el mismo banco sirve en un equipo de trabajo y en
 * integración continua, donde Chrome no está disponible.
 */
async function abrirNavegador(opciones = {}) {
  try { return await chromium.launch({ channel: "chrome", ...opciones }); }
  catch { return await chromium.launch(opciones); }
}


const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const incidencias = [];
let pasos = 0;

/**
 * Ruido esperado que no constituye defecto:
 *  · Trazas de diagnóstico que la propia aplicación emite a propósito.
 *  · El bloqueo CORS de las respuestas 400/404 de api.hacienda.go.cr, que el
 *    navegador registra siempre y la aplicación gestiona con su sonda.
 */
const RUIDO_ESPERADO = [
  /Verificador Hacienda CR/,
  /\[caché\]|\[dedup\]|\[reintento|\[api\]|\[sonda\]|\[error\]/,
  /has been blocked by CORS policy/,
  /Failed to load resource: net::ERR_FAILED/,
  /Failed to load resource: the server responded with a status of (400|404)/
];

function registrar(tipo, texto, contexto) {
  if (RUIDO_ESPERADO.some((re) => re.test(texto))) return;
  incidencias.push({ tipo, texto: texto.slice(0, 180), contexto });
}

(async () => {
  const b = await abrirNavegador();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CR" });
  const p = await ctx.newPage();
  let contexto = "carga inicial";

  p.on("pageerror", (e) => incidencias.push({ tipo: "EXCEPCIÓN", texto: e.message, contexto }));
  p.on("console", (m) => {
    if (m.type() === "error") registrar("console.error", m.text(), contexto);
    if (m.type() === "warning") registrar("console.warn", m.text(), contexto);
  });
  p.on("requestfailed", (r) => {
    const u = r.url();
    if (/api\.hacienda\.go\.cr/.test(u)) return; // fallo esperado: 400/404 sin CORS
    incidencias.push({ tipo: "PETICIÓN FALLIDA", texto: u.slice(0, 120), contexto });
  });

  const paso = async (nombre, fn) => {
    contexto = nombre;
    pasos++;
    try { await fn(); }
    catch (e) { incidencias.push({ tipo: "FALLO DEL PASO", texto: e.message.split("\n")[0].slice(0, 160), contexto }); }
  };

  await p.goto(APP, { waitUntil: "load" });
  await esperar(500);

  /* ============ 1. Recorrido de todas las pestañas y sus guías ============ */
  const tabs = await p.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.id));
  for (const t of tabs) {
    await paso(`pestaña ${t}`, async () => {
      await p.click("#" + t);
      await esperar(120);
      const panel = "panel-" + t.replace("tab-", "");
      if (!(await p.locator("#" + panel).isVisible())) throw new Error(`${panel} no quedó visible`);
      // Abrir y cerrar su panel informativo
      const guia = p.locator(`#${panel} details.guide`);
      if (await guia.count()) {
        await guia.locator("summary").click();
        await esperar(120);
        if (!(await guia.evaluate((n) => n.open))) throw new Error("la guía no se abrió");
        await guia.locator("summary").click();
        await esperar(100);
      }
    });
  }

  /* ============ 2. Formularios: vacío, inválido y válido ================== */
  const casos = [
    { tab: "tab-tributaria", campo: "#in-tributaria", boton: "#btn-tributaria", err: "#err-tributaria",
      vacio: "", malos: ["abc", "123", "0110100123", "12345678901234", "  "], bueno: "4000042139", salida: "#out-tributaria" },
    { tab: "tab-exoneracion", campo: "#in-exoneracion", boton: "#btn-exoneracion", err: "#err-exoneracion",
      vacio: "", malos: ["XX-1-1", "AL-123-45", "hola"], bueno: "AL-00460853-20", salida: "#out-exoneracion" },
    { tab: "tab-agro", campo: "#in-agro", boton: "#btn-agro", err: "#err-agro",
      vacio: "", malos: ["1", "0123456789", "xyz"], bueno: "2100042005", salida: null },
    { tab: "tab-pesca", campo: "#in-pesca", boton: "#btn-pesca", err: "#err-pesca",
      vacio: "", malos: ["1", "0123456789"], bueno: "2100042005", salida: null }
  ];

  for (const c of casos) {
    await paso(`${c.tab}: envío vacío`, async () => {
      await p.click("#" + c.tab.replace("tab-", "tab-"));
      await p.fill(c.campo, c.vacio);
      await p.click(c.boton);
      await esperar(200);
      const e = (await p.locator(c.err).textContent()).trim();
      if (!e) throw new Error("el envío vacío no produjo mensaje de error");
    });

    for (const malo of c.malos) {
      await paso(`${c.tab}: valor inválido «${malo}»`, async () => {
        await p.fill(c.campo, malo);
        await p.click(c.boton);
        await esperar(180);
        const e = (await p.locator(c.err).textContent()).trim();
        const consulto = await p.locator(c.boton).evaluate((n) => n.getAttribute("aria-busy") === "true");
        if (!e && !consulto) throw new Error(`«${malo}» no fue rechazado ni consultado`);
      });
    }

    await paso(`${c.tab}: valor válido`, async () => {
      await p.fill(c.campo, c.bueno);
      await p.click(c.boton);
      await p.waitForSelector(`${c.err.replace("err-", "alert-")} .alert`, { timeout: 45000 });
    });

    await paso(`${c.tab}: Limpiar y Nueva consulta`, async () => {
      const modulo = c.tab.replace("tab-", "");
      const clave = modulo === "exoneracion" ? "exoneracion" : modulo;
      await p.click(`[data-clear="${clave}"]`);
      await esperar(150);
      if ((await p.locator(c.campo).inputValue()) !== "") throw new Error("Limpiar no vació el campo");
      await p.click(`[data-new="${clave}"]`);
      await esperar(150);
    });
  }

  /* ============ 3. CABYS: ambas modalidades y la tabla ==================== */
  await paso("CABYS: código válido y herramientas de tabla", async () => {
    await p.click("#tab-cabys");
    await p.fill("#in-cabys-codigo", "2132100000100");
    await p.click("#btn-cabys");
    await p.waitForSelector("#out-cabys table.data tbody tr", { timeout: 45000 });
  });
  await paso("CABYS: código inexistente", async () => {
    await p.click('[data-clear="cabys"]');
    await p.fill("#in-cabys-codigo", "1111111111111");
    await p.click("#btn-cabys");
    await p.waitForSelector("#alert-cabys .alert", { timeout: 45000 });
  });
  await paso("CABYS: descripción, filtro, orden, paginación y copiado", async () => {
    await p.check('input[name="cabys-modo"][value="descripcion"]');
    await p.fill("#in-cabys-q", "arroz");
    await p.selectOption("#in-cabys-top", "50");
    await p.click("#btn-cabys");
    await p.waitForSelector("#out-cabys table.data tbody tr", { timeout: 45000 });
    await p.fill("#out-cabys .table-filter", "harina");
    await esperar(200);
    await p.fill("#out-cabys .table-filter", "");
    await esperar(200);
    // Ordenar por cada columna, ida y vuelta
    const ths = await p.locator("#out-cabys table.data thead th button").count();
    for (let i = 0; i < ths; i++) {
      await p.locator("#out-cabys table.data thead th button").nth(i).click();
      await esperar(80);
      await p.locator("#out-cabys table.data thead th button").nth(i).click();
      await esperar(80);
    }
    // Paginación completa
    const pager = p.locator("#out-cabys .pager button");
    if (await pager.count()) {
      for (const etiqueta of ["»", "«", "›", "‹"]) {
        const b = p.locator("#out-cabys .pager button", { hasText: etiqueta });
        if (await b.count()) { await b.first().click({ force: true }).catch(() => {}); await esperar(80); }
      }
    }
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
    await p.locator("#out-cabys table.data tbody tr").first().locator("button").click();
    await esperar(200);
  });
  await paso("CABYS: exportación CSV", async () => {
    const d = p.waitForEvent("download", { timeout: 20000 });
    await p.locator("#out-cabys .table-tools button").click();
    await d;
  });
  await paso("CABYS: descripción demasiado corta", async () => {
    await p.fill("#in-cabys-q", "ab");
    await p.click("#btn-cabys");
    await esperar(200);
    if (!(await p.locator("#err-cabys").textContent()).trim()) throw new Error("no rechazó 2 caracteres");
  });

  /* ============ 4. Tipo de cambio ========================================= */
  await paso("Tipo de cambio: consulta y limpieza", async () => {
    await p.click("#tab-cambio");
    await p.click("#btn-tc-actual");
    await p.waitForSelector("#out-tcactual .dl__item", { timeout: 45000 });
    await p.click('[data-clear="tcactual"]');
    await esperar(150);
  });

  /* ============ 5. Doble clic y clics rápidos ============================= */
  await paso("Doble clic no duplica la consulta", async () => {
    await p.click("#tab-tributaria");
    await p.click('[data-clear="tributaria"]');
    await p.fill("#in-tributaria", "3101012386");
    const btn = p.locator("#btn-tributaria");
    await btn.click();
    await btn.click({ force: true, timeout: 2000 }).catch(() => {}); // el botón se deshabilita
    await p.waitForSelector("#out-tributaria .dl__item", { timeout: 45000 });
  });

  /* ============ 6. Manual, guías y tema =================================== */
  await paso("Manual: apertura, índice y cierre", async () => {
    await p.click("#btn-manual");
    await esperar(300);
    const enlaces = await p.locator(".manual__toc a").count();
    for (let i = 0; i < enlaces; i++) { await p.locator(".manual__toc a").nth(i).click(); await esperar(80); }
    await p.keyboard.press("Escape");
    await esperar(250);
  });
  await paso("Tema: ciclo completo de los tres modos", async () => {
    for (let i = 0; i < 4; i++) { await p.click("#btn-theme"); await esperar(120); }
  });
  await paso("Acceso administrativo: rechazo, desbloqueo y cierre", async () => {
    if (await p.locator("#admin-config").isVisible()) throw new Error("la configuración se ve sin desbloquear");
    await p.click("#btn-admin");
    await esperar(250);
    await p.fill("#admin-password", "clave-incorrecta");
    await p.click("#admin-submit");
    await esperar(500);
    if (!(await p.locator("#admin-error").textContent()).trim()) throw new Error("una contraseña incorrecta no produjo aviso");
    if (await p.locator("#admin-config").isVisible()) throw new Error("una contraseña incorrecta desbloqueó la configuración");
    await p.fill("#admin-password", ADMIN_PASSWORD);
    await p.click("#admin-submit");
    await esperar(800);
    if (!(await p.locator("#admin-config").isVisible())) {
      throw new Error("la contraseña correcta no desbloqueó la configuración (exporte ADMIN_PASSWORD si la cambió)");
    }
  });
  await paso("Configuración avanzada: guardar, proxy inválido y restablecer", async () => {
    // El desbloqueo ya despliega el panel: se pulsa el resumen sólo si sigue
    // plegado, porque hacerlo sobre uno abierto lo cerraría.
    if (!(await p.locator("#admin-config").evaluate((n) => n.open))) {
      await p.locator("details.config-card summary").click();
    }
    await esperar(150);
    await p.selectOption("#cfg-ttl", "300000");
    await p.click("#cfg-save");
    await esperar(200);
    await p.fill("#cfg-proxy", "no-es-una-url");
    await p.click("#cfg-save");
    await esperar(200);
    const aviso = await p.locator("#cfg-alert .alert").count();
    if (!aviso) throw new Error("un proxy inválido no produjo aviso");
    await p.fill("#cfg-proxy", "http://ejemplo-inseguro.com");
    await p.click("#cfg-save");
    await esperar(200);
    await p.click("#cfg-reset");
    await esperar(200);
  });
  await paso("Limpiar caché", async () => {
    await p.click("#btn-clear-cache");
    await esperar(200);
    if ((await p.locator("#cache-count").textContent()) !== "0") throw new Error("la caché no quedó en 0");
  });

  /* ============ 7. Sin conexión y recuperación ============================ */
  await paso("Sin conexión: mensaje específico", async () => {
    await ctx.setOffline(true);
    await p.click("#tab-tributaria");
    await p.click('[data-clear="tributaria"]');
    await p.fill("#in-tributaria", "4000001021");
    await p.click("#btn-tributaria");
    await p.waitForSelector("#alert-tributaria .alert--err", { timeout: 30000 });
  });
  await paso("Recuperación de la conexión", async () => {
    await ctx.setOffline(false);
    await esperar(400);
    await p.click('[data-clear="tributaria"]');
    await p.fill("#in-tributaria", "4000001021");
    await p.click("#btn-tributaria");
    await p.waitForSelector("#out-tributaria .dl__item", { timeout: 45000 });
  });

  /* ============ 8. Teclado puro: recorrer toda la interfaz ================ */
  await paso("Recorrido completo con Tab", async () => {
    await p.evaluate(() => document.body.focus());
    for (let i = 0; i < 60; i++) await p.keyboard.press("Tab");
  });

  /* ============ Informe =================================================== */
  console.log("\nRECORRIDO EXHAUSTIVO EN NAVEGADOR\n" + "=".repeat(84));
  console.log(`Pasos ejecutados: ${pasos}`);
  if (incidencias.length === 0) {
    console.log("✓ Ninguna excepción, ningún error ni advertencia de consola, ningún paso fallido.");
  } else {
    console.log(`✗ ${incidencias.length} incidencia(s):\n`);
    for (const i of incidencias) console.log(`  [${i.tipo}] (${i.contexto})\n     ${i.texto}`);
  }
  console.log("=".repeat(84));
  await b.close();
  process.exit(incidencias.length === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR GENERAL:", e.message); process.exit(2); });
