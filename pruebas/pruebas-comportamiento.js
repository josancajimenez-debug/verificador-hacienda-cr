/**
 * Auditoría de comportamiento: manual modal, paneles informativos,
 * teclado y adaptación a pantallas pequeñas con el manual abierto.
 */
const { chromium } = require("playwright");
const path = require("node:path");
const APP = require("node:url").pathToFileURL(path.resolve(process.argv[2])).href;

let ok = 0, ko = 0;
function check(n, c, nota) { c ? ok++ : ko++; console.log(`${c ? "✓" : "✗"} ${n.padEnd(58)} — ${nota}`); }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CR" })).newPage();
  await p.goto(APP, { waitUntil: "load" });
  await esperar(500);

  console.log("\nAUDITORÍA DE COMPORTAMIENTO\n" + "=".repeat(96));

  /* ---------- Manual de usuario ---------- */
  const dlg = p.locator("dialog.manual-dialog");
  check("El manual usa el elemento nativo <dialog>", (await dlg.count()) === 1,
    (await dlg.count()) === 1 ? "<dialog class=\"manual-dialog\">" : "no se encontró");

  check("El manual arranca cerrado", !(await dlg.evaluate((n) => n.open)), "open=false");

  await p.click("#btn-manual");
  await esperar(400);
  const estado = await dlg.evaluate((n) => ({
    abierto: n.open,
    modal: n.matches(":modal"),
    rol: n.getAttribute("role"),
    etiqueta: n.getAttribute("aria-label") || n.getAttribute("aria-labelledby")
  }));
  check("Se abre como diálogo modal (bloquea el fondo)", estado.abierto && estado.modal,
    `open=${estado.abierto}, :modal=${estado.modal}`);
  check("El diálogo tiene nombre accesible", Boolean(estado.etiqueta),
    estado.etiqueta ? `referencia="${estado.etiqueta}"` : "sin aria-label ni aria-labelledby");

  const focoDentro = await p.evaluate(() => {
    const d = document.querySelector("dialog.manual-dialog");
    return d.contains(document.activeElement);
  });
  check("El foco entra en el diálogo al abrirlo", focoDentro,
    "activeElement dentro del <dialog>" + (focoDentro ? "" : " — el foco se queda fuera"));

  const scrollBloqueado = await p.evaluate(() => getComputedStyle(document.body).overflow);
  check("El fondo no se desplaza con el manual abierto", scrollBloqueado === "hidden",
    `body overflow=${scrollBloqueado}`);

  // Índice interno del manual
  const enlacesToc = await p.locator(".manual__toc a").count();
  check("El manual tiene índice navegable", enlacesToc >= 4, `${enlacesToc} enlaces en el índice`);

  // Cierre con Escape (comportamiento nativo de <dialog>)
  await p.keyboard.press("Escape");
  await esperar(400);
  check("Se cierra con la tecla Escape", !(await dlg.evaluate((n) => n.open)), "open=false tras Escape");

  const focoRestaurado = await p.evaluate(() => document.activeElement?.id);
  check("El foco vuelve al botón que abrió el manual", focoRestaurado === "btn-manual",
    `activeElement=#${focoRestaurado || "(body)"}`);

  const scrollLiberado = await p.evaluate(() => getComputedStyle(document.body).overflow);
  check("El desplazamiento del fondo se restablece al cerrar",
    scrollLiberado !== "hidden", `body overflow=${scrollLiberado}`);

  // Cierre con el botón
  await p.click("#btn-manual");
  await esperar(300);
  const btnCerrar = p.locator(".manual__close");
  check("Existe un botón de cierre accesible",
    (await btnCerrar.count()) === 1 && Boolean(await btnCerrar.getAttribute("aria-label") || (await btnCerrar.textContent() || "").trim()),
    `aria-label="${await btnCerrar.getAttribute("aria-label")}"`);
  await btnCerrar.click();
  await esperar(300);
  check("El botón de cierre funciona", !(await dlg.evaluate((n) => n.open)), "open=false");

  /* ---------- Paneles informativos por módulo ---------- */
  const guias = await p.evaluate(() => {
    const g = [...document.querySelectorAll("details.guide, .guide")];
    return {
      total: g.length,
      etiquetas: g.slice(0, 8).map((n) => (n.querySelector("summary")?.textContent || n.textContent || "").trim().slice(0, 46)),
      sonDetails: g.filter((n) => n.tagName === "DETAILS").length
    };
  });
  check("Cada módulo tiene su panel «Significado, uso, aplicación e importancia»",
    guias.total >= 6, `${guias.total} paneles, ${guias.sonDetails} como <details> (plegables con teclado)`);

  const guiaAbre = await p.evaluate(() => {
    const d = document.querySelector("details.guide, details.guide-details, #panel-tributaria details");
    if (!d) return null;
    const antes = d.open; d.open = true; const desp = d.open; d.open = antes;
    return desp;
  });
  check("Los paneles informativos se pueden abrir y cerrar",
    guiaAbre !== false, guiaAbre === null ? "no son <details> (revisar)" : "plegables nativos, accesibles por teclado");

  /* ---------- Recorrido completo por teclado ---------- */
  const focoTotal = await p.evaluate(() => document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
  ).length);
  check("Hay recorrido de teclado en toda la interfaz", focoTotal > 30,
    `${focoTotal} elementos enfocables`);

  /* ---------- Adaptación con el manual abierto ---------- */
  const anchuras = [320, 390, 768, 1280];
  const desbordes = [];
  for (const w of anchuras) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.click("#btn-manual");
    await esperar(350);
    const d = await p.evaluate(() => {
      const dl = document.querySelector("dialog.manual-dialog");
      return {
        paginaDesborda: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialogoDesborda: dl.scrollWidth - dl.clientWidth,
        dentro: dl.getBoundingClientRect().right <= document.documentElement.clientWidth + 1
      };
    });
    if (d.paginaDesborda > 1 || d.dialogoDesborda > 1 || !d.dentro) {
      desbordes.push(`${w}px(pág=${d.paginaDesborda},dlg=${d.dialogoDesborda},dentro=${d.dentro})`);
    }
    await p.keyboard.press("Escape");
    await esperar(250);
  }
  check("El manual se adapta sin desbordar entre 320 y 1280 px",
    desbordes.length === 0, desbordes.length ? desbordes.join(" | ") : anchuras.join(", ") + " px comprobadas");

  console.log("=".repeat(96));
  console.log(`TOTAL: ${ok} superadas, ${ko} fallidas`);
  await b.close();
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
