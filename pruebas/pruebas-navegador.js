/**
 * Pruebas en NAVEGADOR REAL (Chromium/Chrome vía Playwright).
 * Verifica la interfaz de index.html: consultas reales, validaciones,
 * accesibilidad por teclado, tema oscuro y comportamiento CORS
 * (que sólo se manifiesta dentro de un navegador).
 */
"use strict";
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

// Se admite ruta relativa o absoluta: se resuelve siempre a una URL file://
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

const SHOTS = path.resolve(process.argv[3] || ".");

let ok = 0, ko = 0;
function check(nombre, cond, nota) {
  cond ? ok++ : ko++;
  console.log(`${cond ? "✓" : "✗"} ${nombre.padEnd(62)} — ${nota}`);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await abrirNavegador();

  /* ============ ESCRITORIO ============ */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CR" });
  const page = await ctx.newPage();

  const erroresConsola = [];
  page.on("pageerror", (e) => erroresConsola.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") erroresConsola.push("console.error: " + m.text()); });

  await page.goto(APP, { waitUntil: "load" });
  await esperar(400);

  console.log("\nPRUEBAS EN NAVEGADOR REAL (Chrome)\n" + "=".repeat(100));

  check("Carga sin errores de JavaScript", erroresConsola.length === 0,
    erroresConsola.length ? erroresConsola.join(" | ") : "ninguna excepción registrada");

  check("Título y encabezado presentes",
    (await page.title()).includes("Verificador Hacienda CR"),
    await page.locator(".brand__title").textContent());

  check("Los 6 módulos están declarados como pestañas",
    (await page.locator('[role="tab"]').count()) === 6,
    (await page.locator('[role="tab"]').allTextContents()).map(s => s.trim()).join(" · "));

  /* ---- Logo institucional ---- */
  const logoInfo = await page.locator(".brand__logo").evaluate((n) => ({
    cargada: n.complete && n.naturalWidth > 0,
    alt: (n.getAttribute("alt") || "").trim(),
    alto: Math.round(n.getBoundingClientRect().height),
    // Los atributos width/height deben declarar la relación de aspecto real
    // de la imagen; si no, el navegador reserva un espacio incorrecto y la
    // maquetación salta al terminar la carga.
    aspectoDeclarado: Number(n.getAttribute("width")) / Number(n.getAttribute("height")),
    aspectoReal: n.naturalWidth / n.naturalHeight
  }));
  check("Logo ACC Contadores cargado y visible",
    logoInfo.cargada && logoInfo.alto > 30 && logoInfo.alt.length > 3,
    `cargada=${logoInfo.cargada}, alto=${logoInfo.alto}px, alt="${logoInfo.alt}"`);
  check("Los atributos width/height del logo declaran su aspecto real",
    Math.abs(logoInfo.aspectoDeclarado - logoInfo.aspectoReal) < 0.02,
    `declarado=${logoInfo.aspectoDeclarado.toFixed(3)}, real=${logoInfo.aspectoReal.toFixed(3)}`);

  check("La página no carga recursos de dominios externos",
    await page.evaluate(() => ![...document.querySelectorAll("img,script,link,iframe")]
      .some((n) => /^https?:/i.test(n.getAttribute("src") || n.getAttribute("href") || ""))),
    "sin src/href http(s): no depende de CDN, fuentes ni imágenes de terceros");

  // El logo debe ir incrustado: así el HTML se puede enviar suelto por correo
  // sin que la cabecera aparezca rota.
  const imagenes = await page.evaluate(() => [...document.querySelectorAll("img")].map((n) => ({
    clase: n.className,
    incrustada: n.src.startsWith("data:"),
    cargada: n.complete && n.naturalWidth > 0,
    px: `${n.naturalWidth}×${n.naturalHeight}`
  })));
  check("Todas las imágenes van incrustadas y cargan",
    imagenes.length > 0 && imagenes.every((i) => i.incrustada && i.cargada),
    imagenes.map((i) => `${i.clase || "(sin clase)"} ${i.px} data:${i.incrustada}`).join(" · "));

  /* ---- Acceso al Asistente Virtual de ACC Contadores ---- */
  const asistente = await page.evaluate(() => {
    const n = document.getElementById("btn-asistente");
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return {
      href: n.getAttribute("href"),
      target: n.getAttribute("target"),
      rel: n.getAttribute("rel"),
      etiqueta: n.getAttribute("aria-label") || "",
      texto: n.textContent.trim(),
      visible: r.width > 0 && r.height > 0,
      alto: Math.round(r.height),
      enPie: document.querySelectorAll('a[href*="acc-asistente"]').length
    };
  });
  check("Existe el botón «Asistente virtual» en la cabecera",
    asistente !== null && asistente.visible, asistente ? `«${asistente.texto}», ${asistente.alto}px de alto` : "no se encontró");
  check("Apunta al Asistente Virtual de ACC Contadores",
    asistente?.href === "https://josancajimenez-debug.github.io/acc-asistente/", asistente?.href);
  check("Se abre en pestaña nueva de forma segura",
    asistente?.target === "_blank" && /noopener/.test(asistente?.rel || ""),
    `target=${asistente?.target}, rel="${asistente?.rel}"`);
  check("Tiene nombre accesible descriptivo",
    (asistente?.etiqueta || "").length > 30 && /pesta/i.test(asistente.etiqueta),
    `aria-label de ${asistente?.etiqueta.length} caracteres, avisa de la pestaña nueva`);
  check("El Asistente también es accesible desde el pie",
    (asistente?.enPie || 0) >= 2, `${asistente?.enPie} accesos en la página`);

  /* ---- El módulo de histórico ya no existe ---- */
  const restos = await page.evaluate(() => ["form-tchist", "in-desde", "in-hasta", "btn-tchist", "out-tchist"]
    .filter((id) => document.getElementById(id) !== null));
  check("El apartado de tipo de cambio histórico fue eliminado",
    restos.length === 0, restos.length ? "quedan restos: " + restos.join(", ") : "sin elementos residuales en el DOM");

  /* ---- M1: situación tributaria, caso válido ---- */
  await page.fill("#in-tributaria", "4000042139");
  await page.click("#btn-tributaria");
  await page.waitForSelector("#out-tributaria .dl__item", { timeout: 30000 });
  const nombreCt = await page.locator("#out-tributaria .dl__item").nth(1).locator(".dl__v").textContent();
  check("M1 · contribuyente existente muestra el nombre",
    nombreCt.includes("INSTITUTO COSTARRICENSE DE ELECTRICIDAD"), nombreCt.trim());

  const filasAct = await page.locator("#out-tributaria table.data tbody tr").count();
  check("M1 · tabla de actividades económicas renderizada", filasAct >= 1, `${filasAct} filas visibles`);

  check("M1 · mensaje de éxito visible",
    (await page.locator("#alert-tributaria .alert--ok").count()) === 1,
    (await page.locator("#alert-tributaria .alert__title").textContent() || "").trim());

  await page.screenshot({ path: path.join(SHOTS, "01-tributaria-escritorio.png"), fullPage: false });

  /* ---- M1: validación de entrada inválida (sin tocar la red) ---- */
  await page.click('[data-clear="tributaria"]');
  await page.fill("#in-tributaria", "12ab");
  await page.click("#btn-tributaria");
  await esperar(250);
  const errTxt = await page.locator("#err-tributaria").textContent();
  check("M1 · identificación no numérica se rechaza antes de consultar",
    errTxt.includes("únicamente números"), errTxt.trim());
  check("M1 · el campo queda marcado como inválido (aria-invalid)",
    (await page.getAttribute("#in-tributaria", "aria-invalid")) === "true", 'aria-invalid="true"');

  /* ---- M1: regla del cero inicial, bloqueada sin consumir la API ---- */
  await page.click('[data-clear="tributaria"]');
  await page.fill("#in-tributaria", "0110100123");
  await page.click("#btn-tributaria");
  await esperar(250);
  const errCero = await page.locator("#err-tributaria").textContent();
  check("M1 · identificación con 0 inicial se bloquea antes de consultar",
    /no debe comenzar con cero/i.test(errCero), errCero.trim().slice(0, 80) + "…");

  /* ---- M1: CORS — 404 sin cabecera, clasificado con la sonda ---- */
  await page.click('[data-clear="tributaria"]');
  await page.fill("#in-tributaria", "3101002949");
  await page.click("#btn-tributaria");
  await page.waitForSelector("#alert-tributaria .alert--warn", { timeout: 40000 });
  const avisoNF = (await page.locator("#alert-tributaria .alert__title").textContent()).trim();
  check("M1 · registro inexistente se comunica como «no encontrado» (404 sin CORS)",
    avisoNF.includes("no encontrado"), avisoNF);

  /* ---- M2: tipo de cambio actual ---- */
  await page.click("#tab-cambio");
  await page.click("#btn-tc-actual");
  await page.waitForSelector("#out-tcactual .dl__item", { timeout: 30000 });
  const tcTexto = await page.locator("#out-tcactual").innerText();
  check("M2 · tipo de cambio vigente muestra compra y venta",
    /COMPRA/i.test(tcTexto) && /VENTA/i.test(tcTexto) && /₡/.test(tcTexto),
    tcTexto.split("\n").filter(l => /₡/.test(l)).join(" | "));
  check("M2 · se indica la fuente oficial",
    /Ministerio de Hacienda/.test(tcTexto), "«Fuente oficial: Ministerio de Hacienda de Costa Rica»");

  await page.screenshot({ path: path.join(SHOTS, "02-tipo-cambio-escritorio.png") });

/* ---- M3: exoneraciones ---- */
  await page.click("#tab-exoneracion");
  await page.fill("#in-exoneracion", "0046085320");
  await esperar(150);
  const preview = (await page.locator("#preview-exoneracion").textContent()).trim();
  check("M3 · 10 dígitos se convierten automáticamente al formato oficial",
    preview === "AL-00460853-20", `"0046085320" → ${preview}`);

  await page.click("#btn-exoneracion");
  await page.waitForSelector("#out-exoneracion .dl__item", { timeout: 30000 });
  const exTexto = await page.locator("#out-exoneracion").innerText();
  check("M3 · autorización válida muestra los datos de la exoneración",
    /AL-00460853-20/.test(exTexto) && /13/.test(exTexto), "documento, porcentaje, institución y vigencia presentes");
  check("M3 · códigos CABYS cubiertos se listan en tabla",
    (await page.locator("#out-exoneracion table.data tbody tr").count()) >= 1,
    (await page.locator("#out-exoneracion table.data tbody tr").first().innerText()).trim());

  await page.screenshot({ path: path.join(SHOTS, "03-exoneracion-escritorio.png") });

  /* ---- M3: formato incorrecto ---- */
  await page.click('[data-clear="exoneracion"]');
  await page.fill("#in-exoneracion", "XX-1-1");
  await page.click("#btn-exoneracion");
  await esperar(250);
  const errEx = await page.locator("#err-exoneracion").textContent();
  check("M3 · formato incorrecto se rechaza sin consultar la API",
    errEx.includes("AL-XXXXXXXX-XX"), errEx.trim().slice(0, 70) + "…");

  /* ---- M4 y M5: agropecuario y pesca ---- */
  await page.click("#tab-agro");
  await page.fill("#in-agro", "2100042005");
  await page.click("#btn-agro");
  await page.waitForSelector("#alert-agro .alert", { timeout: 30000 });
  const avisoAgro = (await page.locator("#alert-agro .alert__title").textContent()).trim();
  const cuerpoAgro = (await page.locator("#alert-agro .alert__body").innerText()).trim();
  check("M4 · no registrado se comunica con prudencia, sin afirmar de más",
    /No figura/i.test(avisoAgro) && /no constituye por sí sola una certificación/i.test(cuerpoAgro), avisoAgro);

  const enlaceMag = await page.locator("#alert-agro a").getAttribute("href");
  check("M4 · se ofrece el portal oficial del MAG para verificación cruzada",
    enlaceMag === "https://mag.go.cr/servicios-y-tramites/consultaproductor/", enlaceMag);

  await page.click("#tab-pesca");
  await page.fill("#in-pesca", "2100042005");
  await page.click("#btn-pesca");
  await page.waitForSelector("#alert-pesca .alert", { timeout: 30000 });
  check("M5 · registro pesquero no encontrado se comunica correctamente",
    /No figura/i.test((await page.locator("#alert-pesca .alert__title").textContent()).trim()),
    (await page.locator("#alert-pesca .alert__title").textContent()).trim());

  /* ---- M6: CABYS por código ---- */
  await page.click("#tab-cabys");
  await page.fill("#in-cabys-codigo", "2132100000100");
  await page.click("#btn-cabys");
  await page.waitForSelector("#out-cabys table.data tbody tr", { timeout: 30000 });
  const cabysFila = (await page.locator("#out-cabys table.data tbody tr").first().innerText()).replace(/\s+/g, " ");
  check("M6 · búsqueda por código devuelve el bien con su IVA",
    /2132100000100/.test(cabysFila) && /Jugo de tomate/i.test(cabysFila) && /13/.test(cabysFila),
    cabysFila.slice(0, 90));

  /* ---- M6: alternancia de modalidad (regresión del atributo hidden) ---- */
  await page.check('input[name="cabys-modo"][value="descripcion"]');
  await esperar(200);
  const visibilidad = await page.evaluate(() => ["wrap-cabys-codigo", "wrap-cabys-q", "wrap-cabys-top"]
    .map((id) => [id, getComputedStyle(document.getElementById(id)).display]));
  check("M6 · al elegir «por descripción» se oculta el campo de código",
    visibilidad[0][1] === "none" && visibilidad[1][1] !== "none" && visibilidad[2][1] !== "none",
    visibilidad.map(([i, d]) => `${i}=${d}`).join(", "));

  await page.check('input[name="cabys-modo"][value="codigo"]');
  await esperar(200);
  const visibilidad2 = await page.evaluate(() => ["wrap-cabys-codigo", "wrap-cabys-q"]
    .map((id) => getComputedStyle(document.getElementById(id)).display));
  check("M6 · al volver a «por código» se oculta el campo de descripción",
    visibilidad2[0] !== "none" && visibilidad2[1] === "none",
    `codigo=${visibilidad2[0]}, descripcion=${visibilidad2[1]}`);

  /* ---- M6: CABYS por descripción, filtro, orden y copiado ---- */
  await page.check('input[name="cabys-modo"][value="descripcion"]');
  await page.fill("#in-cabys-q", "arroz");
  await page.selectOption("#in-cabys-top", "25");
  await page.click("#btn-cabys");
  await page.waitForSelector("#out-cabys table.data tbody tr", { timeout: 30000 });
  const nFilas = await page.locator("#out-cabys table.data tbody tr").count();
  check("M6 · búsqueda por descripción devuelve resultados paginados",
    nFilas > 0 && nFilas <= 10, `${nFilas} filas en la primera página (tamaño de página = 10)`);

  const totalAntes = (await page.locator("#out-cabys .table-foot").innerText()).trim();
  await page.fill("#out-cabys .table-filter", "harina");
  await esperar(250);
  const totalDespues = (await page.locator("#out-cabys .table-foot").innerText()).trim();
  check("M6 · el filtro de la tabla reduce los resultados",
    totalAntes !== totalDespues, `${totalAntes.replace(/\n/g," ")} → ${totalDespues.replace(/\n/g," ")}`);

  await page.fill("#out-cabys .table-filter", "");
  await esperar(200);
  await page.locator("#out-cabys table.data thead th").first().locator("button").click();
  await esperar(200);
  check("M6 · el encabezado expone el orden aplicado (aria-sort)",
    (await page.locator("#out-cabys table.data thead th").first().getAttribute("aria-sort")) === "ascending",
    'aria-sort="ascending"');

  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const excepcionesCopia = [];
  const capturaCopia = (e) => excepcionesCopia.push(e.message);
  page.on("pageerror", capturaCopia);

  const btnCopiar = page.locator("#out-cabys table.data tbody tr").first().locator("button");
  const rotuloOriginal = (await btnCopiar.textContent()).trim();
  await btnCopiar.click();
  await esperar(300);
  const portapapeles = await page.evaluate(() => navigator.clipboard.readText());
  check("M6 · el botón copia el código CABYS al portapapeles",
    /^\d{13}$/.test(portapapeles), `portapapeles = "${portapapeles}"`);

  // El aviso visual fallaba sin que nadie lo notara: el manejador leía
  // event.currentTarget después de un await, cuando ya vale null.
  const rotuloTrasCopiar = (await btnCopiar.textContent()).trim();
  check("M6 · el botón confirma visualmente el copiado",
    /Copiado/i.test(rotuloTrasCopiar) && excepcionesCopia.length === 0,
    `«${rotuloOriginal}» → «${rotuloTrasCopiar}»` + (excepcionesCopia.length ? ` · EXCEPCIÓN: ${excepcionesCopia[0]}` : " · sin excepciones"));

  await esperar(1600);
  const rotuloRestaurado = (await btnCopiar.textContent()).trim();
  check("M6 · el botón recupera su rótulo original",
    rotuloRestaurado === rotuloOriginal, `«${rotuloTrasCopiar}» → «${rotuloRestaurado}»`);

  // Pulsaciones seguidas: el rótulo no debe quedarse congelado en «Copiado»
  await btnCopiar.click(); await esperar(150);
  await btnCopiar.click(); await esperar(150);
  await btnCopiar.click(); await esperar(1700);
  const rotuloTrasVarias = (await btnCopiar.textContent()).trim();
  check("M6 · pulsaciones repetidas no dejan el rótulo congelado",
    rotuloTrasVarias === rotuloOriginal && excepcionesCopia.length === 0,
    `tras 3 clics seguidos: «${rotuloTrasVarias}»`);
  page.off("pageerror", capturaCopia);

  await page.screenshot({ path: path.join(SHOTS, "04-cabys-escritorio.png") });

  /* ---- Descarga de CSV ---- */
  const descarga = page.waitForEvent("download", { timeout: 15000 });
  await page.locator("#out-cabys .table-tools button").click();
  const archivo = await descarga;
  const destino = path.join(SHOTS, "cabys-exportado.csv");
  await archivo.saveAs(destino);
  const csv = fs.readFileSync(destino, "utf8");
  check("M6 · exportación a CSV genera un archivo con contenido",
    csv.includes("Código CABYS") && csv.split("\r\n").length > 1,
    `${archivo.suggestedFilename()} · ${csv.split("\r\n").length - 1} filas de datos`);

  /* ---- Accesibilidad: navegación por teclado en las pestañas ---- */
  // Las comprobaciones no dependen de un orden concreto de pestañas: se leen
  // del DOM, de modo que reordenar los módulos no invalida las pruebas.
  const orden = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.id));
  const [primera, segunda] = orden;
  const ultima = orden[orden.length - 1];

  await page.locator("#" + primera).focus();
  await page.keyboard.press("ArrowRight");
  await esperar(150);
  const focoTras = await page.evaluate(() => document.activeElement.id);
  check("A11y · las flechas del teclado desplazan el foco entre pestañas",
    focoTras === segunda, `de #${primera} a #${focoTras} (siguiente en el orden del DOM)`);
  check("A11y · la pestaña activa se marca con aria-selected",
    (await page.getAttribute("#" + segunda, "aria-selected")) === "true",
    `#${segunda} con aria-selected="true"`);

  const panelSegunda = "panel-" + segunda.replace("tab-", "");
  const panelPrimera = "panel-" + primera.replace("tab-", "");
  check("A11y · el panel correspondiente queda visible y el resto oculto",
    (await page.locator("#" + panelSegunda).isVisible()) && !(await page.locator("#" + panelPrimera).isVisible()),
    `#${panelSegunda} visible, #${panelPrimera} oculto`);

  await page.keyboard.press("End");
  await esperar(150);
  check("A11y · la tecla Fin salta a la última pestaña",
    (await page.evaluate(() => document.activeElement.id)) === ultima, `foco en #${ultima}`);
  await page.keyboard.press("Home");
  await esperar(150);
  check("A11y · la tecla Inicio vuelve a la primera pestaña",
    (await page.evaluate(() => document.activeElement.id)) === primera, `foco en #${primera}`);

  const inactivas = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')].filter((t) => t.tabIndex === 0).length);
  check("A11y · sólo una pestaña participa en el orden de tabulación",
    inactivas === 1, `${inactivas} pestaña con tabindex="0"; el resto, -1`);

  check("A11y · existe enlace para saltar al contenido",
    (await page.locator(".skip-link").count()) === 1,
    (await page.locator(".skip-link").textContent()).trim());

  const regiones = await page.locator('[aria-live="polite"]').count();
  check("A11y · regiones aria-live para anunciar resultados", regiones >= 6, `${regiones} regiones declaradas`);

  /* ---- Tema oscuro ---- */
  await page.click("#btn-theme");           // auto → claro
  await page.click("#btn-theme");           // claro → oscuro
  await esperar(200);
  const tema = await page.getAttribute("html", "data-theme");
  check("UI · el conmutador aplica el modo oscuro", tema === "dark", `data-theme="${tema}"`);
  await page.click("#tab-cabys");
  await page.screenshot({ path: path.join(SHOTS, "05-cabys-modo-oscuro.png") });

  /* ---- Caché y privacidad ---- */
  const cacheAntes = await page.locator("#cache-count").textContent();
  await page.click("#btn-clear-cache");
  await esperar(200);
  const cacheDespues = await page.locator("#cache-count").textContent();
  check("Privacidad · «Limpiar caché» vacía las consultas almacenadas",
    Number(cacheAntes) > 0 && cacheDespues === "0", `${cacheAntes} → ${cacheDespues}`);

  const almacenamiento = await page.evaluate(() => ({
    local: Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)]),
    session: Object.keys(sessionStorage)
  }));
  const textoLocal = JSON.stringify(almacenamiento);
  check("Privacidad · ninguna identificación consultada queda almacenada",
    !/4000042139|3101002949|2100042005|00460853/.test(textoLocal),
    `localStorage = ${almacenamiento.local.map(([k]) => k).join(", ") || "(vacío)"}; sessionStorage = ${almacenamiento.session.length} claves`);

  /* ---- Sin conexión ---- */
  await ctx.setOffline(true);
  await page.click("#tab-tributaria");
  await page.fill("#in-tributaria", "4000001021");
  await page.click("#btn-tributaria");
  await page.waitForSelector("#alert-tributaria .alert--err", { timeout: 20000 });
  const avisoOffline = (await page.locator("#alert-tributaria .alert__title").textContent()).trim();
  check("Errores · la falta de conexión produce un mensaje específico",
    /Sin conexión/i.test(avisoOffline), avisoOffline);
  check("Errores · la barra de estado refleja la desconexión",
    (await page.locator("#net-text").textContent()).includes("Sin conexión"),
    (await page.locator("#net-text").textContent()).trim());
  await ctx.setOffline(false);

  await ctx.close();

  /* ============ MÓVIL ============ */
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, locale: "es-CR"
  });
  const pm = await movil.newPage();
  await pm.goto(APP, { waitUntil: "load" });
  await esperar(300);

  await pm.click("#tab-cabys");
  await pm.check('input[name="cabys-modo"][value="descripcion"]');
  await pm.fill("#in-cabys-q", "cafe");
  await pm.click("#btn-cabys");
  await pm.waitForSelector("#out-cabys table.data tbody tr", { timeout: 30000 });

  const desbordamiento = await pm.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("Móvil · la página no desborda horizontalmente (390 px)",
    desbordamiento <= 1, `scrollWidth − clientWidth = ${desbordamiento} px`);

  // Barrido de anchuras: desde el móvil más estrecho hasta escritorio
  const anchuras = [320, 360, 390, 414, 600, 768, 1024, 1280, 1600];
  const desbordes = [];
  for (const w of anchuras) {
    await pm.setViewportSize({ width: w, height: 800 });
    await esperar(160);
    const d = await pm.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (d > 1) desbordes.push(`${w}px→${d}`);
  }
  check("Responsive · ninguna anchura entre 320 y 1600 px desborda",
    desbordes.length === 0,
    desbordes.length ? "desbordan: " + desbordes.join(", ") : anchuras.join(", ") + " px comprobadas");

  await pm.setViewportSize({ width: 320, height: 800 });
  await esperar(200);
  const cabecera320 = await pm.evaluate(() => {
    const l = document.querySelector(".brand__logo");
    const t = document.querySelector(".brand__title");
    const rl = l.getBoundingClientRect(), rt = t.getBoundingClientRect();
    return {
      logo: Math.round(rl.height),
      logoAncho: Math.round(rl.width),
      tituloVisible: rt.width > 0,
      // El logo no debe monopolizar el ancho ni salirse de la ventana
      dentroDeVentana: rl.right <= document.documentElement.clientWidth + 1,
      proporcionDelAncho: rl.width / document.documentElement.clientWidth
    };
  });
  check("Responsive · el encabezado con logo se adapta a 320 px",
    cabecera320.tituloVisible && cabecera320.dentroDeVentana && cabecera320.proporcionDelAncho < 0.45,
    `logo=${cabecera320.logoAncho}×${cabecera320.logo}px (${Math.round(cabecera320.proporcionDelAncho * 100)}% del ancho), ` +
    `título visible=${cabecera320.tituloVisible}, dentro de la ventana=${cabecera320.dentroDeVentana}`);

  await pm.setViewportSize({ width: 390, height: 844 });
  await esperar(200);

  const apilada = await pm.evaluate(() => {
    const td = document.querySelector("#out-cabys table.data tbody td");
    return td ? getComputedStyle(td).display : null;
  });
  check("Móvil · la tabla se reorganiza en tarjetas apiladas", apilada === "flex",
    `display de las celdas = ${apilada}`);

  const alturaBoton = await pm.evaluate(() => {
    const b = document.querySelector("#btn-cabys");
    return b ? Math.round(b.getBoundingClientRect().height) : 0;
  });
  check("Móvil · los botones cumplen el objetivo táctil mínimo (44 px)",
    alturaBoton >= 44, `altura del botón Buscar = ${alturaBoton} px`);

  await pm.screenshot({ path: path.join(SHOTS, "06-cabys-movil.png"), fullPage: false });
  await pm.click("#tab-tributaria");
  await pm.fill("#in-tributaria", "4000001021");
  await pm.click("#btn-tributaria");
  await pm.waitForSelector("#out-tributaria .dl__item", { timeout: 30000 });
  await pm.screenshot({ path: path.join(SHOTS, "07-tributaria-movil.png"), fullPage: false });

  await movil.close();
  await browser.close();

  console.log("=".repeat(100));
  console.log(`TOTAL: ${ok} superadas, ${ko} fallidas`);
  console.log(`Capturas guardadas en: ${SHOTS}`);
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error("FALLO GENERAL:", e); process.exit(2); });
