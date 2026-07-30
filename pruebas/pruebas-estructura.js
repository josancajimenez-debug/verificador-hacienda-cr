/**
 * Auditoría estructural y de accesibilidad ejecutada en un navegador real.
 * Recorre el DOM ya construido y reporta defectos objetivos.
 */
const { chromium } = require("playwright");
const path = require("node:path");
const APP = require("node:url").pathToFileURL(path.resolve(process.argv[2])).href;

/**
 * Abre Google Chrome si está instalado y, si no, el Chromium que incluye
 * Playwright. Así el mismo banco sirve en un equipo de trabajo y en
 * integración continua, donde Chrome no está disponible.
 */
async function abrirNavegador(opciones = {}) {
  try { return await chromium.launch({ channel: "chrome", ...opciones }); }
  catch { return await chromium.launch(opciones); }
}


(async () => {
  const b = await abrirNavegador();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CR" });
  const p = await ctx.newPage();
  const consola = [];
  p.on("pageerror", (e) => consola.push("EXCEPCIÓN: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") consola.push("console.error: " + m.text()); });
  p.on("requestfailed", (r) => consola.push("PETICIÓN FALLIDA: " + r.url().slice(0, 120)));

  await p.goto(APP, { waitUntil: "load" });
  await p.waitForTimeout(600);

  const r = await p.evaluate(() => {
    const out = {};

    // --- 1. Identificadores duplicados ---
    const ids = {};
    document.querySelectorAll("[id]").forEach((n) => { ids[n.id] = (ids[n.id] || 0) + 1; });
    out.idsDuplicados = Object.entries(ids).filter(([, c]) => c > 1).map(([k, c]) => `${k}×${c}`);

    // --- 2. Referencias ARIA e IDREF que apuntan a la nada ---
    const roto = [];
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "for"]) {
      document.querySelectorAll(`[${attr}]`).forEach((n) => {
        n.getAttribute(attr).split(/\s+/).filter(Boolean).forEach((ref) => {
          if (!document.getElementById(ref)) roto.push(`${n.tagName.toLowerCase()}[${attr}="${ref}"]`);
        });
      });
    }
    out.referenciasRotas = [...new Set(roto)];

    // --- 3. Anclas internas sin destino ---
    out.anclasRotas = [...document.querySelectorAll('a[href^="#"]')]
      .map((a) => a.getAttribute("href").slice(1))
      .filter((id) => id && !document.getElementById(id) && id !== "top");

    // --- 4. Controles de formulario sin etiqueta accesible ---
    out.sinEtiqueta = [...document.querySelectorAll("input,select,textarea")]
      .filter((n) => !["hidden", "submit", "button", "radio"].includes(n.type))
      .filter((n) => {
        if (n.getAttribute("aria-label") || n.getAttribute("aria-labelledby")) return false;
        if (n.id && document.querySelector(`label[for="${n.id}"]`)) return false;
        if (n.closest("label")) return false;
        return true;
      })
      .map((n) => `${n.tagName.toLowerCase()}#${n.id || "(sin id)"}[type=${n.type}]`);

    // --- 5. Imágenes sin texto alternativo ---
    out.imgSinAlt = [...document.querySelectorAll("img")]
      .filter((n) => n.getAttribute("alt") === null)
      .map((n) => (n.getAttribute("src") || "").slice(0, 50));

    // --- 6. Enlaces que abren pestaña nueva sin rel seguro ---
    out.targetSinRel = [...document.querySelectorAll('a[target="_blank"]')]
      .filter((a) => !/noopener/.test(a.getAttribute("rel") || ""))
      .map((a) => (a.getAttribute("href") || "").slice(0, 60));

    // --- 7. Enlaces relativos (dependencias de archivos junto al HTML) ---
    out.enlacesRelativos = [...new Set([...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && !/^(https?:|mailto:|tel:|#|data:)/i.test(h)))];

    // --- 8. Orden de encabezados: no deben saltarse niveles ---
    const niveles = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter((h) => h.offsetParent !== null || h.closest("dialog"))
      .map((h) => ({ n: Number(h.tagName[1]), t: h.textContent.trim().slice(0, 40) }));
    out.saltosEncabezado = [];
    for (let i = 1; i < niveles.length; i++) {
      if (niveles[i].n - niveles[i - 1].n > 1) {
        out.saltosEncabezado.push(`h${niveles[i - 1].n} → h${niveles[i].n} en «${niveles[i].t}»`);
      }
    }
    out.totalH1 = document.querySelectorAll("h1").length;

    // --- 9. Paneles y pestañas coherentes ---
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const paneles = [...document.querySelectorAll('[role="tabpanel"]')];
    out.tabs = tabs.length;
    out.tabpanels = paneles.length;
    out.tabsSinPanel = tabs.filter((t) => !document.getElementById(t.getAttribute("aria-controls") || "")).length;
    out.tabsSeleccionadas = tabs.filter((t) => t.getAttribute("aria-selected") === "true").length;

    // Ningún panel debe estar dentro de otro. Si uno queda anidado en un panel
    // oculto, su contenido resulta inalcanzable aunque su pestaña se active, y
    // ni el conteo de paneles ni las referencias ARIA lo delatan.
    out.panelesAnidados = paneles
      .filter((p) => p.parentElement.closest('[role="tabpanel"]'))
      .map((p) => `#${p.id} dentro de #${p.parentElement.closest('[role="tabpanel"]').id}`);

    // Cada panel debe colgar directamente del contenedor principal.
    out.panelesFueraDeMain = paneles
      .filter((p) => p.parentElement !== document.querySelector("main"))
      .map((p) => `#${p.id} en <${p.parentElement.tagName.toLowerCase()}>`);

    // Al activar cada pestaña, su primer control debe quedar realmente visible.
    out.panelesConControlOculto = [];
    for (const t of tabs) {
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      if (!panel) continue;
      const previo = paneles.map((p) => p.hidden);
      paneles.forEach((p) => { p.hidden = p !== panel; });
      const control = panel.querySelector("input:not([type=hidden]), select, button");
      if (control && control.offsetParent === null) {
        out.panelesConControlOculto.push(`#${panel.id} → ${control.tagName.toLowerCase()}#${control.id || "(sin id)"}`);
      }
      paneles.forEach((p, k) => { p.hidden = previo[k]; });
    }

    // --- 10. Elementos con id referenciados por el script pero ausentes ---
    const src = [...document.querySelectorAll("script")].map((s) => s.textContent).join("\n");
    const usados = new Set();
    for (const m of src.matchAll(/\$\(\s*"([^"]+)"\s*\)/g)) usados.add(m[1]);
    for (const m of src.matchAll(/getElementById\(\s*"([^"]+)"\s*\)/g)) usados.add(m[1]);
    out.idsUsadosPeroAusentes = [...usados].filter((id) => !document.getElementById(id));

    // --- 11. Atributos de imagen con aspecto incorrecto ---
    out.imgAspectoIncorrecto = [...document.querySelectorAll("img[width][height]")]
      .filter((n) => n.naturalWidth > 0)
      .filter((n) => Math.abs((n.width / n.height) - (n.naturalWidth / n.naturalHeight)) > 0.02)
      .map((n) => `${(n.getAttribute("src") || "").slice(0, 30)} declarado=${(n.width / n.height).toFixed(2)} real=${(n.naturalWidth / n.naturalHeight).toFixed(2)}`);

    // --- 12. lang y metadatos ---
    out.lang = document.documentElement.lang;
    out.titulo = document.title;
    out.tieneViewport = !!document.querySelector('meta[name="viewport"]');

    return out;
  });

  console.log("\nAUDITORÍA ESTRUCTURAL Y DE ACCESIBILIDAD\n" + "=".repeat(78));
  const lineas = [
    ["Excepciones y errores de consola", consola],
    ["Identificadores duplicados", r.idsDuplicados],
    ["Referencias ARIA/for rotas", r.referenciasRotas],
    ["Anclas internas sin destino", r.anclasRotas],
    ["Controles sin etiqueta accesible", r.sinEtiqueta],
    ["Imágenes sin alt", r.imgSinAlt],
    ["target=_blank sin rel=noopener", r.targetSinRel],
    ["Saltos en el orden de encabezados", r.saltosEncabezado],
    ["Ids usados por el script pero ausentes", r.idsUsadosPeroAusentes],
    ["Imágenes con aspecto declarado erróneo", r.imgAspectoIncorrecto],
    ["Paneles anidados dentro de otro panel", r.panelesAnidados],
    ["Paneles que no cuelgan de <main>", r.panelesFueraDeMain],
    ["Paneles cuyo primer control no se ve al activarlos", r.panelesConControlOculto]
  ];
  let problemas = 0;
  for (const [n, v] of lineas) {
    const mal = v.length > 0;
    if (mal) problemas += v.length;
    console.log(`${mal ? "✗" : "✓"} ${n.padEnd(42)} ${mal ? v.length + " → " + v.slice(0, 6).join(" | ").slice(0, 260) : "ninguno"}`);
  }
  console.log("-".repeat(78));
  console.log(`  lang="${r.lang}" · <h1>=${r.totalH1} · viewport=${r.tieneViewport}`);
  console.log(`  pestañas=${r.tabs} · paneles=${r.tabpanels} · sin panel=${r.tabsSinPanel} · seleccionadas=${r.tabsSeleccionadas}`);
  console.log(`  enlaces relativos (dependen de archivos vecinos): ${r.enlacesRelativos.length}`);
  r.enlacesRelativos.forEach((h) => console.log(`     · ${h}`));
  console.log("=".repeat(78));
  console.log(problemas === 0 ? "Sin defectos estructurales." : `${problemas} incidencia(s) que revisar.`);
  await b.close();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
