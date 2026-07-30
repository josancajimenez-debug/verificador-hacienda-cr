/**
 * Auditoría de comportamiento: manual modal, acceso administrativo, paneles
 * informativos, teclado y adaptación a pantallas pequeñas con el manual abierto.
 */
const { chromium } = require("playwright");
const path = require("node:path");
const APP = require("node:url").pathToFileURL(path.resolve(process.argv[2])).href;

/* Contraseña administrativa con la que se publica la aplicación. Si usted la
   cambia siguiendo el README, exporte ADMIN_PASSWORD antes de ejecutar el
   banco; en caso contrario estas pruebas avisarán de que no coincide. */
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


let ok = 0, ko = 0;
function check(n, c, nota) { c ? ok++ : ko++; console.log(`${c ? "✓" : "✗"} ${n.padEnd(58)} — ${nota}`); }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await abrirNavegador();
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

  /* ---------- Acceso administrativo a la configuración avanzada ---------- */
  const visible = (sel) => p.evaluate((s) => {
    const n = document.querySelector(s);
    return Boolean(n && n.offsetParent !== null);
  }, sel);

  check("La configuración avanzada no se ve sin desbloquear",
    !(await visible("#admin-config")),
    "#admin-config oculto al cargar la página");
  check("El botón de acceso arranca en estado bloqueado",
    (await p.locator("#btn-admin").getAttribute("data-admin")) === "locked",
    `data-admin="${await p.locator("#btn-admin").getAttribute("data-admin")}" · rótulo «${(await p.locator("#admin-label").textContent()).trim()}»`);

  await p.click("#btn-admin");
  await esperar(350);
  const admDlg = p.locator("dialog.admin-dialog");
  const admEstado = await admDlg.evaluate((n) => ({
    modal: n.matches(":modal"),
    etiqueta: n.getAttribute("aria-label") || n.getAttribute("aria-labelledby"),
    tipo: n.querySelector("#admin-password")?.type
  }));
  check("El acceso se pide en un diálogo modal con nombre accesible",
    admEstado.modal && Boolean(admEstado.etiqueta),
    `:modal=${admEstado.modal}, referencia="${admEstado.etiqueta}"`);
  check("La contraseña se escribe enmascarada", admEstado.tipo === "password",
    `<input type="${admEstado.tipo}">`);

  // Escape debe cerrar el diálogo sin conceder acceso.
  await p.keyboard.press("Escape");
  await esperar(300);
  check("Escape cierra el acceso sin desbloquear nada",
    !(await admDlg.evaluate((n) => n.open)) && !(await visible("#admin-config")),
    "diálogo cerrado y configuración aún oculta");

  // Una contraseña equivocada no debe conceder acceso.
  await p.click("#btn-admin");
  await esperar(300);
  await p.fill("#admin-password", "clave-que-no-es");
  await p.click("#admin-submit");
  await esperar(600);
  const errorTexto = (await p.locator("#admin-error").textContent()).trim();
  check("Una contraseña incorrecta se rechaza y no revela la configuración",
    errorTexto.length > 0 && !(await visible("#admin-config")) &&
    (await p.locator("#btn-admin").getAttribute("data-admin")) === "locked",
    `aviso «${errorTexto}» · configuración aún oculta`);

  // La contraseña correcta sí debe conceder acceso.
  await p.fill("#admin-password", ADMIN_PASSWORD);
  await p.click("#admin-submit");
  await esperar(900);
  const desbloqueado = await visible("#admin-config");
  check("La contraseña correcta muestra la configuración avanzada",
    desbloqueado && (await p.locator("#btn-admin").getAttribute("data-admin")) === "unlocked",
    desbloqueado
      ? `rótulo «${(await p.locator("#admin-label").textContent()).trim()}» · #admin-config visible`
      : "no se desbloqueó: ¿la contraseña se cambió? exporte ADMIN_PASSWORD");

  // Desbloqueado, el botón ya no abre un diálogo: cierra la sesión. Prometer
  // lo contrario a un lector de pantalla sería un anuncio falso.
  const ariaTrasDesbloquear = await p.locator("#btn-admin").evaluate((n) => ({
    haspopup: n.getAttribute("aria-haspopup"),
    controls: n.getAttribute("aria-controls")
  }));
  check("El botón deja de anunciar un diálogo cuando ya no lo abre",
    ariaTrasDesbloquear.haspopup === null && ariaTrasDesbloquear.controls === null,
    `aria-haspopup=${ariaTrasDesbloquear.haspopup ?? "(ausente)"}, aria-controls=${ariaTrasDesbloquear.controls ?? "(ausente)"}`);

  const rastro = await p.evaluate((clave) => {
    const todo = Object.entries(localStorage).map(([k, v]) => k + "=" + v).join(" | ") +
      " | " + Object.entries(sessionStorage).map(([k, v]) => k + "=" + v).join(" | ") +
      " | " + document.cookie;
    return { filtra: todo.includes(clave), sesion: Object.keys(sessionStorage).join(", ") };
  }, ADMIN_PASSWORD);
  check("La contraseña nunca se guarda en el navegador", !rastro.filtra,
    `sessionStorage sólo conserva la marca de sesión: ${rastro.sesion || "(vacío)"}`);

  // El desbloqueo debe sobrevivir a una recarga de la misma pestaña.
  await p.reload({ waitUntil: "load" });
  await esperar(500);
  check("El desbloqueo se conserva al recargar la pestaña", await visible("#admin-config"),
    "sessionStorage mantiene la sesión administrativa");

  await p.click("#btn-admin");
  await esperar(400);
  const trasCerrar = await p.evaluate(() => ({
    visible: Boolean(document.querySelector("#admin-config")?.offsetParent),
    claves: Object.keys(sessionStorage).length,
    haspopup: document.querySelector("#btn-admin").getAttribute("aria-haspopup")
  }));
  check("«Cerrar admin» vuelve a ocultar la configuración y borra la sesión",
    !trasCerrar.visible && trasCerrar.claves === 0,
    `configuración oculta · sessionStorage = ${trasCerrar.claves} claves`);
  check("Al bloquear de nuevo, el botón vuelve a anunciar el diálogo",
    trasCerrar.haspopup === "dialog", `aria-haspopup="${trasCerrar.haspopup}"`);

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

  await p.setViewportSize({ width: 1280, height: 900 });

  /* ---------- Regresión · una respuesta no interpretable no se anuncia como éxito ----
   * /fe/ae devuelve un objeto con la ficha del contribuyente. Un JSON válido
   * pero sin ficha (null, un arreglo, un número) no es un resultado, y el aviso
   * favorable llegaba a taparle su advertencia dejando «Consulta realizada»
   * sobre un panel vacío.
   */
  await p.click("#tab-tributaria");
  for (const [cuerpo, nombre] of [["null", "null"], ["[]", "un arreglo"], ["123", "un número"]]) {
    const r = await p.evaluate(async (c) => {
      const original = window.fetch;
      window.fetch = async () => new Response(c, { status: 200, headers: { "Content-Type": "application/json" } });
      document.getElementById("in-tributaria").value = "3101012386";
      document.getElementById("form-tributaria").dispatchEvent(new Event("submit", { cancelable: true }));
      await new Promise((r) => setTimeout(r, 500));
      window.fetch = original;
      cacheClear();
      return document.getElementById("alert-tributaria").textContent.trim();
    }, cuerpo);
    check(`Un cuerpo con ${nombre} no se anuncia como consulta correcta`,
      /Respuesta vacía/.test(r) && !/Consulta realizada/.test(r), `aviso mostrado: «${r.slice(0, 52)}…»`);
  }
  await p.evaluate(() => { limpiarModulo("tributaria"); });

  /* ---------- Regresión · CABYS: la marca de campo inválido no sobrevive al cambio de modalidad ---- */
  await p.click("#tab-cabys");
  const cabys = await p.evaluate(() => {
    document.getElementById("in-cabys-codigo").value = "123";   // menos de 13 dígitos
    document.getElementById("form-cabys").dispatchEvent(new Event("submit", { cancelable: true }));
    const trasError = document.getElementById("in-cabys-codigo").getAttribute("aria-invalid");
    const radio = document.querySelector('input[name="cabys-modo"][value="descripcion"]');
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    return { trasError, trasCambio: document.getElementById("in-cabys-codigo").getAttribute("aria-invalid") };
  });
  check("Un código inválido marca el campo como aria-invalid",
    cabys.trasError === "true", `aria-invalid=${cabys.trasError}`);
  check("La marca de inválido se retira al cambiar de modalidad",
    cabys.trasCambio === null, `aria-invalid=${cabys.trasCambio ?? "(ausente)"} tras pasar a «Por descripción»`);
  await p.evaluate(() => { limpiarModulo("cabys"); });

  /* ---------- Regresión · la columna «Vigencia» sí reordena la tabla ---------- */
  await p.click("#tab-agro");
  const orden = await p.evaluate(() => {
    renderRegistro(
      { outId: "out-agro", alertId: "alert-agro", csvBase: "prueba",
        institucion: "MAG", tituloResultado: "t", tituloNoEncontrado: "n", textoNoEncontrado: "t" },
      { listaDatosMAG: [
        { nombreMAG: "Ana",  indicadorActivoMAG: false, fechaVenceMAG: "2020-01-01T00:00:00" },
        { nombreMAG: "Beto", indicadorActivoMAG: true,  fechaVenceMAG: "2099-01-01T00:00:00" },
        { nombreMAG: "Cira", indicadorActivoMAG: false, fechaVenceMAG: "2019-01-01T00:00:00" }
      ] },
      "123456789");
    const leer = () => [...document.querySelectorAll("#out-agro table.data tbody tr")]
      .map((tr) => tr.lastElementChild.textContent);
    const antes = leer();
    [...document.querySelectorAll("#out-agro thead .th-sort")]
      .find((b) => /Vigencia/.test(b.textContent)).click();
    return { antes, despues: leer() };
  });
  check("La columna «Vigencia» reordena realmente las filas",
    JSON.stringify(orden.antes) !== JSON.stringify(orden.despues),
    `antes: ${orden.antes.join(", ")} → después: ${orden.despues.join(", ")}`);
  check("Al ordenar, los asientos vigentes quedan primero",
    orden.despues[0] === "Vigente", `primera fila: «${orden.despues[0]}»`);
  await p.evaluate(() => { limpiarModulo("agro"); });

  console.log("=".repeat(96));
  console.log(`TOTAL: ${ok} superadas, ${ko} fallidas`);
  await b.close();
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
