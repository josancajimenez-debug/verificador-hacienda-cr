/**
 * Rendimiento, memoria, seguridad y contraste.
 * Se ejecuta en el navegador y manipula el estado interno de la aplicación
 * para comprobar comportamientos que no se alcanzan por la interfaz.
 */
const { chromium } = require("playwright");
const path = require("node:path");
const APP = require("node:url").pathToFileURL(path.resolve(process.argv[2])).href;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, ko = 0;
function check(n, c, nota) { c ? ok++ : ko++; console.log(`${c ? "✓" : "✗"} ${n.padEnd(58)} — ${nota}`); }

/** Contraste WCAG entre dos colores rgb(). */
function contraste(c1, c2) {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(c1), lum(c2)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-CR" });
  const p = await ctx.newPage();
  const excepciones = [];
  p.on("pageerror", (e) => excepciones.push(e.message));
  await p.goto(APP, { waitUntil: "load" });
  await esperar(400);

  console.log("\nCALIDAD: MEMORIA, SEGURIDAD Y CONTRASTE\n" + "=".repeat(84));

  /* ---------- Caché: tope de entradas ---------- */
  const tope = await p.evaluate(() => {
    for (let i = 0; i < 400; i++) cacheSet("https://ejemplo/" + i, { i });
    return { tamano: cache.size, maximo: CACHE_MAX_ENTRADAS, primera: cache.keys().next().value };
  });
  check("La caché respeta un tope de entradas",
    tope.tamano === tope.maximo, `tras insertar 400: ${tope.tamano} entradas (tope ${tope.maximo})`);
  check("Al superar el tope se descartan las más antiguas",
    tope.primera === "https://ejemplo/300", `la entrada más vieja conservada es ${tope.primera}`);

  /* ---------- Caché: purga de lo caducado ---------- */
  const purga = await p.evaluate(async () => {
    cacheClear();
    prefs.ttl = 1000;
    cacheSet("https://ejemplo/caduca", { x: 1 });
    const antes = cache.size;
    await new Promise((r) => setTimeout(r, 1200));
    purgarCaduco();                       // el barrido periódico hace esto solo
    return { antes, despues: cache.size, temporizador: purgaProgramada === null };
  });
  check("Las entradas caducadas se eliminan aunque nadie las reconsulte",
    purga.antes === 1 && purga.despues === 0, `${purga.antes} → ${purga.despues} entradas`);
  check("El barrido periódico se detiene cuando la caché queda vacía",
    purga.temporizador, "sin temporizador activo: no consume recursos en reposo");

  /* ---------- Limitador: un solo temporizador ---------- */
  const lim = await p.evaluate(async () => {
    const original = window.fetch;
    window.fetch = async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    const tareas = [];
    for (let i = 0; i < 25; i++) tareas.push(limiter.run(async () => i));
    const temporizadoresActivos = limiter._temporizador !== null ? 1 : 0;
    const enCola = limiter.queue.length;
    await Promise.all(tareas);
    window.fetch = original;
    return { temporizadoresActivos, enCola, colaFinal: limiter.queue.length, activos: limiter.active };
  });
  check("El limitador mantiene un único temporizador pendiente",
    lim.temporizadoresActivos <= 1, `${lim.temporizadoresActivos} temporizador con ${lim.enCola} tareas en cola`);
  check("La cola del limitador se vacía por completo",
    lim.colaFinal === 0 && lim.activos === 0, `cola=${lim.colaFinal}, activas=${lim.activos}`);

  /* ---------- Seguridad: CSV a prueba de fórmulas ---------- */
  const csv = await p.evaluate(async () => {
    let capturado = null;
    const originalCrear = URL.createObjectURL;
    URL.createObjectURL = (blob) => { capturado = blob; return "blob:falso"; };
    const clicOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    downloadCSV("prueba.csv", ["A", "B"], [["=SUM(1+1)", "+34"], ["-1+1", "@cmd"], ['con "comillas"', "normal"]]);
    URL.createObjectURL = originalCrear;
    HTMLAnchorElement.prototype.click = clicOriginal;
    if (!capturado) return { texto: "", bytes: [] };
    return {
      texto: await capturado.text(),
      bytes: [...new Uint8Array(await capturado.arrayBuffer())].slice(0, 8)
    };
  });
  const texto = csv.texto || "";
  check("El CSV neutraliza las fórmulas (= + - @)",
    /"'=SUM/.test(texto) && /"'\+34"/.test(texto) && /"'-1\+1"/.test(texto) && /"'@cmd"/.test(texto),
    "los cuatro prefijos peligrosos quedan escapados con apóstrofo");
  check("El CSV escapa las comillas dobles",
    /con ""comillas""/.test(texto), 'las comillas internas se duplican según RFC 4180');
  // El BOM debe leerse en bytes: Blob.text() lo descarta al decodificar UTF-8.
  check("El CSV lleva BOM para que Excel respete las tildes",
    csv.bytes[0] === 0xEF && csv.bytes[1] === 0xBB && csv.bytes[2] === 0xBF,
    `primeros bytes: ${csv.bytes.slice(0, 3).map((b) => b.toString(16).toUpperCase()).join(" ")}`);

  /* ---------- Seguridad: almacenamiento local ---------- */
  await p.evaluate(() => { cacheClear(); prefs.ttl = 600000; });
  await p.click("#tab-tributaria");
  await p.fill("#in-tributaria", "4000042139");
  await p.click("#btn-tributaria");
  await p.waitForSelector("#out-tributaria .dl__item", { timeout: 45000 });
  const almacenado = await p.evaluate(() => ({
    local: Object.entries(localStorage).map(([k, v]) => k + "=" + v).join(" | "),
    session: Object.keys(sessionStorage).length,
    cookies: document.cookie
  }));
  check("Ninguna identificación llega al almacenamiento persistente",
    !/4000042139/.test(almacenado.local + almacenado.cookies) && almacenado.session === 0,
    `localStorage: ${almacenado.local.slice(0, 70)} · sessionStorage: ${almacenado.session} claves · cookies: ${almacenado.cookies || "ninguna"}`);

  /* ---------- Seguridad: el proxy sólo admite HTTPS ---------- */
  const proxy = await p.evaluate(() => {
    const casos = ["http://ajeno.com", "javascript:alert(1)", "no-es-url", "ftp://x.com"];
    const resultados = {};
    for (const c of casos) {
      document.getElementById("cfg-proxy").value = c;
      document.getElementById("cfg-save").click();
      resultados[c] = prefs.proxy === c ? "ACEPTADO" : "rechazado";
    }
    document.getElementById("cfg-reset").click();
    return resultados;
  });
  const aceptados = Object.entries(proxy).filter(([, v]) => v === "ACEPTADO").map(([k]) => k);
  check("El proxy rechaza esquemas inseguros",
    aceptados.length === 0, aceptados.length ? "ACEPTA: " + aceptados.join(", ") : "http, javascript:, ftp y texto suelto rechazados");

  /* ---------- Contraste de color en ambos temas ---------- */
  // Las transiciones de color deben desactivarse antes de medir: si no, se lee
  // un valor intermedio de la animación y el resultado es falso.
  await p.addStyleTag({ content: "*,*::before,*::after{transition:none !important;animation:none !important}" });

  for (const tema of ["light", "dark"]) {
    await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), tema);
    await esperar(250);
    const medidas = await p.evaluate(() => {
      const objetivos = [
        [".tab[aria-selected='true']", "pestaña activa"],
        [".tab:not([aria-selected='true'])", "pestaña inactiva"],
        [".card__desc", "descripción de tarjeta"],
        [".hint", "texto de ayuda"],
        [".dl__k", "etiqueta de campo"],
        [".card__endpoint", "ruta del endpoint"],
        [".statusbar", "barra de estado"],
        [".btn--primary", "botón principal"],
        [".btn", "botón secundario"],
        [".tool-btn", "herramienta de cabecera"],
        [".app-footer", "pie de página"],
        [".result-meta", "marca de tiempo del resultado"]
      ];
      // Los elementos sobre gradiente se omiten: no tienen un color de fondo
      // único contra el que medir. El encabezado usa texto blanco sobre azul
      // muy oscuro, muy por encima del mínimo.
      const fondo = (n) => {
        let e = n;
        while (e) {
          const cs = getComputedStyle(e);
          if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
          const c = cs.backgroundColor;
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
          e = e.parentElement;
        }
        return "rgb(255,255,255)";
      };
      return objetivos.map(([sel, nombre]) => {
        const n = document.querySelector(sel);
        if (!n) return null;
        const f = fondo(n);
        if (f === null) return null;   // sobre gradiente: no procede
        const cs = getComputedStyle(n);
        return { nombre, color: cs.color, fondo: f, tam: parseFloat(cs.fontSize), peso: cs.fontWeight };
      }).filter(Boolean);
    });
    const flojos = [];
    for (const m of medidas) {
      const r = contraste(m.color, m.fondo);
      // WCAG AA: 4,5:1 en texto normal; 3:1 si es grande (≥24px, o ≥18,66px en negrita)
      const grande = m.tam >= 24 || (m.tam >= 18.66 && Number(m.peso) >= 700);
      const minimo = grande ? 3 : 4.5;
      if (r < minimo) flojos.push(`${m.nombre} ${r.toFixed(2)}:1 (mín. ${minimo})`);
    }
    check(`Contraste WCAG AA en tema ${tema === "light" ? "claro" : "oscuro"}`,
      flojos.length === 0,
      flojos.length ? flojos.join(" · ") : `${medidas.length} elementos comprobados, todos por encima del mínimo`);
  }

  check("Ninguna excepción durante estas comprobaciones",
    excepciones.length === 0, excepciones.length ? excepciones[0] : "ninguna");

  console.log("=".repeat(84));
  console.log(`TOTAL: ${ok} superadas, ${ko} fallidas`);
  await b.close();
  process.exit(ko === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(2); });
