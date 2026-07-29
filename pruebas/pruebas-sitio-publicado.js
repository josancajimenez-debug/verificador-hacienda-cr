/**
 * Verificación del sitio PUBLICADO: comprueba que la aplicación funciona
 * desde su URL pública real (HTTPS, origen github.io), incluidas las
 * consultas a api.hacienda.go.cr, que es donde importa el CORS.
 */
const { chromium } = require("playwright");
const path = require("node:path");
const URL_APP = process.argv[2];
const OUT = process.argv[3];

let ok = 0, ko = 0;
function check(n, c, nota) { c ? ok++ : ko++; console.log(`${c ? "✓" : "✗"} ${n.padEnd(56)} — ${nota}`); }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CR" });
  const p = await ctx.newPage();

  const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });

  console.log("\nVERIFICACIÓN DEL SITIO PUBLICADO\n" + URL_APP + "\n" + "=".repeat(88));

  const resp = await p.goto(URL_APP, { waitUntil: "load", timeout: 60000 });
  await esperar(500);

  check("El sitio responde por HTTPS", resp.status() === 200 && URL_APP.startsWith("https://"),
    `HTTP ${resp.status()} · ${resp.url()}`);
  check("Carga sin errores de JavaScript", errores.length === 0,
    errores.length ? errores.join(" | ").slice(0, 120) : "ninguna excepción");
  check("Logo de ACC Contadores visible",
    await p.locator(".brand__logo").evaluate((n) => n.complete && n.naturalWidth > 0),
    "imagen incrustada, cargada correctamente");

  // --- Consulta real desde el origen público: aquí es donde importa el CORS ---
  await p.fill("#in-tributaria", "3101012386");
  await p.click("#btn-tributaria");
  await p.waitForSelector("#out-tributaria .dl__item", { timeout: 45000 });
  const nombre = await p.locator("#out-tributaria .dl__item").nth(1).locator(".dl__v").innerText();
  check("M1 · consulta real a api.hacienda.go.cr desde github.io",
    nombre.toUpperCase().includes("HACIENDA SAN JERONIMO"), nombre.trim());

  await p.click("#tab-cambio");
  await p.click("#btn-tc-actual");
  await p.waitForSelector("#out-tcactual .dl__item", { timeout: 45000 });
  const tc = await p.locator("#out-tcactual").innerText();
  check("M2 · tipo de cambio consultado desde el sitio público",
    /₡/.test(tc), tc.split("\n").filter((l) => /₡/.test(l)).join(" | "));

  await p.click("#tab-cabys");
  await p.fill("#in-cabys-codigo", "2132100000100");
  await p.click("#btn-cabys");
  await p.waitForSelector("#out-cabys table.data tbody tr", { timeout: 45000 });
  check("M6 · CABYS consultado desde el sitio público",
    /Jugo de tomate/i.test(await p.locator("#out-cabys table.data tbody tr").first().innerText()),
    (await p.locator("#out-cabys table.data tbody tr").first().innerText()).replace(/\s+/g, " ").slice(0, 70));

  // 404 sin CORS, la ruta crítica de la sonda, ahora en HTTPS real
  await p.click("#tab-exoneracion");
  await p.fill("#in-exoneracion", "AL-01234567-89");
  await p.click("#btn-exoneracion");
  await p.waitForSelector("#alert-exoneracion .alert--warn", { timeout: 45000 });
  check("M3 · 404 sin CORS bien clasificado en el sitio público",
    /no encontrada/i.test(await p.locator("#alert-exoneracion .alert__title").innerText()),
    (await p.locator("#alert-exoneracion .alert__title").innerText()).trim());

  await p.click("#tab-tributaria");
  await p.screenshot({ path: path.join(OUT, "10-sitio-publicado.png") });

  // --- Móvil sobre el sitio publicado ---
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-CR" });
  const pm = await m.newPage();
  await pm.goto(URL_APP, { waitUntil: "load", timeout: 60000 });
  await esperar(500);
  await pm.fill("#in-tributaria", "4000001021");
  await pm.click("#btn-tributaria");
  await pm.waitForSelector("#out-tributaria .dl__item", { timeout: 45000 });
  const overflow = await pm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Móvil · el sitio publicado funciona y no desborda",
    overflow <= 1, `desbordamiento = ${overflow} px, consulta resuelta`);
  await pm.screenshot({ path: path.join(OUT, "11-sitio-publicado-movil.png") });

  await b.close();
  console.log("=".repeat(88));
  console.log(`TOTAL: ${ok} superadas, ${ko} fallidas`);
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
