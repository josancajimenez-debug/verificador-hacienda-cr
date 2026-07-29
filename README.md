# Verificador Hacienda CR

Aplicación web para consultar información pública mediante las **API oficiales del Ministerio de Hacienda de Costa Rica**.

Referencia técnica única: <https://api.hacienda.go.cr/docs>

Un solo archivo `index.html`, autónomo, sin dependencias, sin compilación y sin backend. Funciona en computadoras, tabletas y teléfonos móviles.

---

## Índice

1. [Puesta en marcha en 30 segundos](#1-puesta-en-marcha-en-30-segundos)
2. [Estructura del proyecto](#2-estructura-del-proyecto)
3. [Módulos y su endpoint oficial](#3-módulos-y-su-endpoint-oficial)
4. [Decisión de arquitectura: por qué NO se requiere un proxy](#4-decisión-de-arquitectura-por-qué-no-se-requiere-un-proxy)
5. [Proxy opcional: cuándo conviene y cómo publicarlo](#5-proxy-opcional-cuándo-conviene-y-cómo-publicarlo)
6. [Publicación y forma de compartir la aplicación](#6-publicación-y-forma-de-compartir-la-aplicación)
7. [Límites de consumo y caché](#7-límites-de-consumo-y-caché)
8. [Manejo de errores](#8-manejo-de-errores)
9. [Protección de datos personales](#9-protección-de-datos-personales)
10. [Accesibilidad](#10-accesibilidad)
11. [Pruebas](#11-pruebas)
12. [Mantenimiento](#12-mantenimiento)
13. [Advertencias y limitaciones conocidas](#13-advertencias-y-limitaciones-conocidas)

---

## 1. Puesta en marcha en 30 segundos

**Uso inmediato.** Abra `index.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox, Safari). No hace falta instalar nada ni levantar un servidor: la aplicación consulta directamente los servicios oficiales.

**Aplicación ya publicada:** <https://josancajimenez-debug.github.io/verificador-hacienda-cr/>

Ese enlace es público: puede compartirse por correo, WhatsApp o como material de un curso, y funciona en computadora, tableta y teléfono sin instalar nada.

**Para publicar su propia copia**, suba `index.html` a GitHub Pages, Netlify, Cloudflare Pages o cualquier alojamiento estático. Consulte la [sección 6](#6-publicación-y-forma-de-compartir-la-aplicación).

Requisitos del navegador: soporte de `fetch`, `async/await`, `Intl` y variables CSS. Cumple cualquier versión publicada desde 2020 aproximadamente.

---

## 2. Estructura del proyecto

```
VERIFICADOR/
├── index.html                 ← LA APLICACIÓN. Único archivo necesario.
│                                 (incluye el logo de ACC Contadores incrustado)
├── ACC.CONTADORES.jpg         ← Logo original, por si desea reemplazarlo.
├── README.md                  ← Este documento.
├── PRUEBAS.md                 ← Resultados y evidencia de las pruebas.
│
├── proxy/                     ← OPCIONAL. No se necesita para el uso normal.
│   ├── worker.js              ← Proxy para Cloudflare Workers.
│   └── server.js              ← Proxy equivalente en Node.js, sin dependencias.
│
└── pruebas/                   ← Bancos de prueba reproducibles y evidencia.
    ├── pruebas-logica.js      ← 60 pruebas de validadores y normalizadores.
    ├── pruebas-api.js         ← 16 pruebas de integración contra la API real.
    ├── pruebas-navegador.js   ← 46 pruebas en Chrome (interfaz, a11y, móvil).
    ├── pruebas-sitio-publicado.js ← 8 pruebas contra la URL pública ya desplegada.
    └── capturas/              ← Capturas de pantalla y un CSV exportado real.
```

### Organización interna de `index.html`

El archivo está dividido en dieciséis secciones numeradas y comentadas. Busque el separador `== §` para navegar:

| Sección | Contenido |
|---|---|
| § 1 | Estilos: tokens de diseño, temas claro/oscuro, componentes, adaptación móvil |
| § 2 | Marcado de la interfaz (encabezado, pestañas, seis paneles, pie) |
| § 3 | Utilidades DOM y de formato (`el()`, fechas, números, CSV, portapapeles) |
| § 4 | Configuración, rutas oficiales y catálogos |
| § 5 | Caché temporal en memoria |
| § 6 | Limitador de tasa y deduplicación de solicitudes |
| § 7 | Cliente HTTP: `apiGet()`, errores tipificados, timeout, reintentos, sonda CORS |
| § 8 | Componente `DataTable`: filtro, orden, paginación, CSV, copiado |
| § 9 | Infraestructura de interfaz: pestañas, tema, alertas, estado de red |
| § 10–15 | Un bloque por módulo (validación → consulta → presentación) |
| § 16 | Arranque |

Cada módulo sigue siempre el mismo patrón, lo que facilita añadir uno nuevo:

```
validar entrada  →  apiGet(ruta, parámetros)  →  render…()  →  showAlert()
```

---

## 3. Módulos y su endpoint oficial

| # | Módulo | Endpoint oficial | Parámetros | Validación aplicada antes de consultar |
|---|---|---|---|---|
| 1 | Situación tributaria | `GET /fe/ae` | `identificacion` | Solo dígitos, entre 9 y 12, sin cero inicial |
| 2 | Tipo de cambio del dólar | `GET /indicadores/tc/dolar` | — | — |
| 3 | Exoneraciones | `GET /fe/ex` | `autorizacion` | Expresión regular `^AL-\d{8}-\d{2}$` tras normalización automática |
| 4 | Productores agropecuarios (MAG) | `GET /fe/agropecuario` | `identificacion` | Solo dígitos, entre 9 y 12, sin cero inicial |
| 5 | Productores y actividades pesqueras | `GET /fe/pesca` | `identificacion` | Solo dígitos, entre 9 y 12, sin cero inicial |
| 6a | CABYS por código | `GET /fe/cabys` | `codigo` | Exactamente 13 dígitos |
| 6b | CABYS por descripción | `GET /fe/cabys` | `q`, `top` | Mínimo 3 caracteres |

Todos apuntan al origen `https://api.hacienda.go.cr`. No se emplea ningún servicio de terceros, ningún endpoint no documentado y ningún dato simulado.

> **Nota.** La consulta de *tipo de cambio histórico por rango de fechas* (`/indicadores/tc/dolar/historico`) **no forma parte de la aplicación**. Llegó a implementarse y a probarse, pero el servicio del Ministerio devuelve `503 Service unavailable` de forma sostenida —falla incluso el ejemplo publicado en su propia documentación— y se retiró para no ofrecer una función que no puede funcionar. Los detalles del diagnóstico se conservan en [`PRUEBAS.md`](PRUEBAS.md). Mientras tanto, la serie histórica puede consultarse en el portal del Banco Central: <https://sdd.bccr.fi.cr/es/IndicadoresEconomicos/Inicio/Contenedor/6?Cuadro=1>

### Regla del cero inicial (verificada, contradice documentación de terceros)

Circulan listas comunitarias de APIs costarricenses que afirman que, para consultar `/fe/agropecuario` y `/fe/pesca`, «es necesario incluir el 0 como primer dígito» en las identificaciones físicas nacionales. **La verificación directa demuestra lo contrario:** cualquier identificación que empiece por `0` se rechaza con **HTTP 400** en los tres endpoints que reciben este parámetro.

Pares comparados, mismo número con y sin el cero:

| Petición | Resultado |
|---|---|
| `/fe/ae?identificacion=012345678` | **400** Bad Request |
| `/fe/ae?identificacion=112345678` | 404 (formato aceptado) |
| `/fe/agropecuario?identificacion=0987654321` | **400** Bad Request |
| `/fe/agropecuario?identificacion=1987654321` | 200 (formato aceptado) |
| `/fe/pesca?identificacion=098765432` | **400** Bad Request |
| `/fe/pesca?identificacion=198765432` | 200 (formato aceptado) |

La aplicación bloquea el cero inicial **antes** de enviar la solicitud y explica cómo corregirlo. Sin esta comprobación el error sería especialmente confuso: al llegar el 400 sin cabeceras CORS, la interfaz lo habría presentado como «no se encontró información» en lugar de señalar el error de formato.

Para personas jurídicas se mantiene el criterio de usar los primeros 10 dígitos de la cédula, sin los dos dígitos verificadores finales.

### Estructuras de respuesta observadas

Verificadas mediante peticiones reales el 29 de julio de 2026.

**`/fe/ae`**

```json
{
  "nombre": "BANCO NACIONAL DE COSTA RICA",
  "tipoIdentificacion": "02",
  "regimen":   { "codigo": 1, "descripcion": "Régimen general" },
  "situacion": { "moroso": "NO", "omiso": "NO", "estado": "Inscrito",
                 "administracionTributaria": "Dirección de Grandes Contribuyentes Nacionales" },
  "actividades": [ { "estado": "A", "tipo": "P", "codigo": "6492.0",
                     "descripcion": "Otros tipos de crédito" } ]
}
```

Cuando el contribuyente no está inscrito, `situacion` incluye además un campo `mensaje` con el texto oficial del Ministerio, que la aplicación muestra íntegro en un aviso destacado.

**`/indicadores/tc/dolar`**

```json
{ "venta":  { "fecha": "2026-07-29", "valor": 454.55 },
  "compra": { "fecha": "2026-07-29", "valor": 449.94 } }
```

**`/fe/ex`**

```json
{ "numeroDocumento": "AL-00460853-20", "identificacion": "401760738",
  "codigoProyectoCFIA": 0, "porcentajeExoneracion": 13, "autorizacion": 460853,
  "fechaEmision": "2020-12-15T00:00:00", "fechaVencimiento": "2021-12-15T00:00:00",
  "ano": 2020, "cabys": ["7211200000100"], "tipoAutorizacion": "exoneracion",
  "tipoDocumento": { "codigo": "04", "descripcion": "Exenciones Dirección General de Hacienda" },
  "CodigoInstitucion": "01", "nombreInstitucion": "Ministerio de Hacienda", "poseeCabys": true }
```

**`/fe/cabys?codigo=…`** devuelve un **arreglo** (vacío si el código no existe):

```json
[ { "categorias": ["…", "…"], "codigo": "2132100000100",
    "descripcion": "Jugo de tomate concentrado", "impuesto": 13 } ]
```

**`/fe/cabys?q=…&top=…`** devuelve un **objeto**:

```json
{ "total": 73, "cantidad": 3,
  "cabys": [ { "codigo": "…", "descripcion": "…", "categorias": ["…"],
               "impuesto": 13, "uri": "…", "estado": "" } ] }
```

`total` es el número de coincidencias en el catálogo y `cantidad` el número devuelto. Cuando `total > cantidad`, la aplicación avisa expresamente de que los resultados son parciales.

**`/fe/agropecuario` y `/fe/pesca`** — comportamiento particular documentado en la [sección 13](#13-advertencias-y-limitaciones-conocidas): cuando no hay registro, responden **HTTP 200** con un cuerpo de error:

```json
{ "type": "https://tools.ietf.org/html/rfc7231#section-6.5.4",
  "title": "Not Found", "status": 404, "traceId": "…" }
```

La función `detectarErrorIncrustado()` (§ 7) intercepta este caso para que no se interprete como un resultado válido.

---

## 4. Decisión de arquitectura: por qué NO se requiere un proxy

Antes de definir la arquitectura se comprobó experimentalmente el comportamiento CORS de cada endpoint.

**Resultado: CORS está habilitado en las respuestas correctas.** Todas las respuestas con código 200 incluyen la cabecera `Access-Control-Allow-Origin: *`:

```
$ curl -s -D - -H "Origin: https://example.com" \
    "https://api.hacienda.go.cr/fe/ae?identificacion=4000042139" | head -3

HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
X-Origin-App: api.hacienda.go.cr
```

Por lo tanto se entrega **un único `index.html` autónomo**, tal como es preferible: sin backend, publicable en GitHub Pages y compartible mediante un simple enlace.

**Matiz importante y verificado.** Las respuestas **400** y **404** no las genera la aplicación de origen sino la capa estática de Akamai, y **no** incluyen cabeceras CORS:

```
$ curl -s -D - -H "Origin: https://example.com" \
    "https://api.hacienda.go.cr/fe/ae?identificacion=3101002949" | head -6

HTTP/1.1 404 Not Found
Content-Type: application/json
Server: AkamaiNetStorage
                              ← no aparece Access-Control-Allow-Origin
```

Consecuencia práctica: en un navegador, `fetch()` no puede leer esa respuesta y rechaza con un `TypeError` idéntico al de una caída de red. Un 404 legítimo resultaría indistinguible de un fallo de conexión.

**Solución adoptada (sin proxy).** El cliente HTTP incorpora una **sonda de conectividad** (`connectivityProbe()`, § 7). Cuando `fetch` falla con `TypeError`, la aplicación consulta `/indicadores/tc/dolar` —un recurso que sí devuelve cabeceras CORS— y decide:

| Sonda | Interpretación | Mensaje mostrado |
|---|---|---|
| Responde | La red funciona → era un 400/404 sin CORS | «No se encontró información…» / «Contribuyente no encontrado» |
| No responde | Problema real de red | «No fue posible comunicarse con el servicio» |

El resultado de la sonda se recuerda 60 segundos para no generar tráfico adicional. Esta ruta se validó en Chrome real (véase `PRUEBAS.md`, caso *M1 · registro inexistente*).

En ningún momento se desactiva un mecanismo de seguridad del navegador ni se emplea un servicio proxy público de terceros.

---

## 5. Proxy opcional: cuándo conviene y cómo publicarlo

El proxy **no es necesario**. Su único beneficio es recibir los códigos 400 y 404 exactos junto al mensaje literal del Ministerio, sin recurrir a la sonda. Considérelo si desea la máxima fidelidad de diagnóstico o si su red corporativa bloquea las peticiones directas al dominio del Ministerio.

Ambas variantes reenvían la petición sin modificarla, aplican una lista blanca de rutas y parámetros, y no registran ni almacenan las consultas.

### Opción A — Cloudflare Workers (plan gratuito, recomendado)

1. Cree una cuenta en <https://dash.cloudflare.com>.
2. **Workers & Pages → Create → Worker**, asígnele un nombre y despliegue.
3. Pulse **Edit code**, borre el contenido de ejemplo y pegue `proxy/worker.js` completo.
4. **Deploy**. Obtendrá una URL del tipo `https://NOMBRE.SUCUENTA.workers.dev`.
5. En `proxy/worker.js`, cambie `ORIGENES_PERMITIDOS` de `["*"]` a la lista de dominios donde publique la aplicación, por ejemplo `["https://miusuario.github.io"]`, y vuelva a desplegar.
6. En la aplicación, abra **Configuración avanzada** y pegue la URL en «URL de su propio proxy». Guarde.

### Opción B — Node.js (local o en un servidor propio)

Requiere Node.js 18 o superior. No instala ninguna dependencia.

```bash
node proxy/server.js --port 8787
```

Verificación:

```bash
curl "http://localhost:8787/salud"
# {"code":200,"status":"OK","proxy":"VerificadorHaciendaCR"}
```

Después, en **Configuración avanzada**, escriba `http://localhost:8787`.

> La aplicación sólo acepta direcciones de proxy que usen HTTPS, salvo `localhost` y `127.0.0.1`. Utilice exclusivamente un proxy que usted mismo haya desplegado.

Prueba real de que el proxy resuelve el problema descrito:

```
$ curl -s -D - -H "Origin: http://localhost:8080" \
    "http://localhost:8787/fe/ae?identificacion=3101002949" | head -6

HTTP/1.1 404 Not Found
Content-Type: application/json
Cache-Control: no-store
X-Proxy-Upstream-Status: 404
Access-Control-Allow-Origin: *      ← ahora el navegador SÍ puede leer el 404
```

---

## 6. Publicación y forma de compartir la aplicación

### Enlace público en funcionamiento

**<https://josancajimenez-debug.github.io/verificador-hacienda-cr/>**

Publicado con GitHub Pages desde el repositorio <https://github.com/josancajimenez-debug/verificador-hacienda-cr>. Es gratuito, se sirve por HTTPS y no caduca.

Para **actualizar** el sitio basta con publicar los cambios; GitHub Pages reconstruye solo en un par de minutos:

```bash
git add index.html
git commit -m "Descripción del cambio"
git push
```

> **Por qué no se publicó como Artifact de Claude.** Se evaluó esa vía. Un Artifact se sirve con una política de seguridad de contenido (CSP) estricta que **bloquea cualquier petición a un servidor externo**, incluidas las de `fetch`. La aplicación se vería correctamente, pero **ninguna consulta a `api.hacienda.go.cr` funcionaría**, que es justamente su razón de ser. Las capacidades que un Artifact puede solicitar (`downloads` y `mcp`) no incluyen acceso de red a terceros, y no existe forma de sortearlo. Por eso se optó por un alojamiento estático convencional, donde las consultas sí funcionan: verificado en el banco de pruebas del sitio publicado.

### Publicar su propia copia en GitHub Pages

```bash
git init
git add index.html README.md PRUEBAS.md proxy pruebas
git commit -m "Verificador Hacienda CR"
git branch -M main
git remote add origin https://github.com/USUARIO/verificador-hacienda-cr.git
git push -u origin main
```

En el repositorio: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.

En pocos minutos estará disponible en `https://USUARIO.github.io/verificador-hacienda-cr/`, listo para compartir por correo, WhatsApp o como enlace en un curso.

### Otras alternativas

| Plataforma | Procedimiento |
|---|---|
| **Netlify Drop** | Arrastre la carpeta a <https://app.netlify.com/drop>. Publicación inmediata. |
| **Cloudflare Pages** | Conecte el repositorio; sin comando de compilación, directorio raíz. |
| **Vercel** | `vercel --prod` en la carpeta del proyecto. |
| **Intranet o servidor propio** | Copie `index.html` a cualquier carpeta servida por Apache, IIS o Nginx. |
| **Sin Internet en el servidor** | Envíe el archivo `index.html`; se abre con doble clic. Requiere conexión sólo para consultar la API. |

Se recomienda servir la aplicación por **HTTPS**: el botón «Copiar código CABYS» utiliza la API moderna del portapapeles, que muchos navegadores restringen a contextos seguros (existe un mecanismo alternativo, pero es menos fiable).

---

## 7. Límites de consumo y caché

Política oficial publicada en la documentación del Ministerio:

| Tipo de límite | Umbral | Equivalencia | Consecuencia |
|---|---|---|---|
| Ráfaga corta | 20 solicitudes/s durante 5 s | máx. 100 en 5 s | Bloqueo de la IP por 10 min |
| Promedio sostenido | 10 solicitudes/s durante 120 s | máx. 1 200 en 2 min | Bloqueo de la IP por 10 min |

Medidas implementadas, todas verificables en el código:

1. **Limitador de tasa propio** (§ 6): como máximo **2 solicitudes simultáneas** y una nueva cada **200 ms** (≈ 5 por segundo), la mitad del umbral sostenido y la cuarta parte del de ráfaga.
2. **Caché temporal en memoria** (§ 5): las consultas idénticas se resuelven sin tráfico durante 10 minutos de forma predeterminada (configurable: sin caché, 5, 10 o 30 minutos).
3. **Deduplicación de solicitudes en vuelo** (§ 6): dos peticiones idénticas simultáneas comparten una única solicitud de red. Un doble clic **no** genera dos llamadas.
4. **Botón deshabilitado durante el proceso**: mientras hay una consulta en curso el botón queda inactivo y marcado con `aria-busy`.
5. **Reintentos controlados** (§ 7): máximo **3**, únicamente ante 429 y errores 5xx, con espera progresiva de 1 s, 2 s y 4 s más una variación aleatoria. Si la respuesta incluye la cabecera `Retry-After`, se respeta ese valor. Los reintentos por tiempo agotado se limitan a **uno**, para no dejar a la persona usuaria más de un minuto esperando.
6. **Errores definitivos sin reintento**: 400, 404, respuesta vacía o formato inválido no se reintentan nunca; reintentarlos sería tráfico inútil.
7. **Mensaje comprensible ante bloqueo**: el código 429 se traduce a «El Ministerio de Hacienda ha limitado temporalmente las consultas desde esta conexión… Los bloqueos automáticos duran alrededor de 10 minutos».

> **Advertencia sobre redes compartidas.** En Costa Rica es habitual que muchos usuarios compartan una misma dirección IP pública (CGNAT). El bloqueo se aplica por IP, de modo que el consumo de terceros en su misma red puede afectarle aunque su uso sea moderado. Evite dejar la aplicación consultando de forma automática o desatendida.

---

## 8. Manejo de errores

Cada situación se traduce a un mensaje en español comprensible; el detalle técnico se conserva en la consola del navegador (**F12**).

| Situación | Tipo interno | Mensaje mostrado |
|---|---|---|
| 400 — parámetro faltante o inválido | `bad-request` | Parámetro faltante o con formato inválido |
| 404 — registro inexistente | `not-found` | Registro no encontrado |
| 400/404 sin cabecera CORS | `sin-resultado` | No se encontró información *(véase § 4)* |
| 429 — límite excedido | `rate-limited` | Límite de consultas excedido; espere unos minutos |
| 5xx — error del servidor | `server` | Servicio oficial temporalmente no disponible |
| Sin conexión a Internet | `offline` | Sin conexión a Internet |
| Tiempo de espera agotado (15 s) | `timeout` | Tiempo de espera agotado |
| Fallo de red o DNS | `network` | No fue posible comunicarse con el servicio |
| Respuesta bloqueada por CORS | `cors` | El navegador bloqueó la respuesta |
| Respuesta vacía | `vacia` | Respuesta vacía |
| Estructura inesperada | `formato` | Respuesta con formato inesperado, mostrando el JSON original |
| Cualquier otro caso | `desconocido` | Error inesperado |

Además, cada módulo personaliza el mensaje cuando aporta claridad. Por ejemplo, un 404 en el módulo 1 se anuncia como «Contribuyente no encontrado» con el número consultado, y en los módulos 4 y 5 como «No figura en el registro consultado», acompañado de la advertencia de que la ausencia de datos no constituye por sí sola una certificación oficial.

Ante una estructura no reconocida, la aplicación **nunca inventa una interpretación**: muestra el JSON original tal como llegó, dentro de un bloque desplegable, además de un aviso explicando la situación.

---

## 9. Protección de datos personales

- **No se almacena ningún número de identificación.** La caché reside exclusivamente en un `Map` en memoria: desaparece al recargar la página, al cerrar la pestaña o al pulsar «Limpiar caché».
- **No se usan `localStorage` ni `sessionStorage` para datos de consulta.** En `localStorage` sólo se guarda la clave `verificadorHaciendaCR.prefs`, con tres valores no personales: tema visual, duración de la caché y, si se configura, la dirección del proxy propio. Comprobado automáticamente (véase `PRUEBAS.md`).
- **No se envía información a terceros.** El único destino de las peticiones es `api.hacienda.go.cr`, o el proxy que usted mismo despliegue.
- **Sin analítica, sin cookies propias, sin recursos externos.** La página no carga fuentes, scripts ni imágenes de otros dominios; se declara `referrer: no-referrer`.
- **Las credenciales del navegador no se envían:** todas las peticiones usan `credentials: "omit"`.
- **Prevención de inyección de contenido:** ningún dato recibido de la API se inserta con `innerHTML`. Todo el contenido dinámico se construye con `document.createElement` y `textContent`.
- **Prevención de inyección de fórmulas en CSV:** las celdas que comienzan con `=`, `+`, `-` o `@` se prefijan con un apóstrofo para que Excel o LibreOffice no las ejecuten.

Recuerde que las consultas se refieren a información pública, pero el número de identificación introducido es un dato personal. Evite proyectar la pantalla o compartir capturas con datos de terceros sin autorización.

---

## 10. Accesibilidad

- Navegación completa por teclado: `Tab` para recorrer, flechas ←/→ para cambiar de módulo, `Inicio` y `Fin` para ir al primero o al último.
- Patrón ARIA de pestañas correctamente implementado (`role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, gestión de `tabindex`).
- Diecisiete regiones `aria-live="polite"` que anuncian resultados y mensajes a los lectores de pantalla.
- Enlace «Saltar al contenido principal» como primer elemento tabulable.
- Campos con etiqueta asociada, texto de ayuda vinculado por `aria-describedby` y errores marcados con `aria-invalid` y `role="alert"`.
- Foco siempre visible, con un contorno de 3 px y separación respecto al elemento.
- Objetivo táctil mínimo de 44 × 44 px en todos los controles.
- Temas claro y oscuro con contraste suficiente, más un modo automático que sigue la preferencia del sistema.
- Se respeta `prefers-reduced-motion`: las animaciones se desactivan para quien lo haya solicitado.
- Toda la interfaz está en español, incluidos los mensajes de error y las etiquetas de accesibilidad.

---

## 11. Pruebas

Resultados completos y evidencia en **[`PRUEBAS.md`](PRUEBAS.md)**. Resumen:

| Banco | Casos | Resultado |
|---|---|---|
| Lógica pura (validadores, normalizadores, clasificadores) | 60 | 60 correctos |
| Integración contra la API oficial | 16 | 16 correctos |
| Navegador real (Chrome: interfaz, accesibilidad, móvil) | 46 | 46 correctos |
| Sitio publicado (URL pública real) | 8 | 8 correctos |
| **Total** | **130** | **130 correctos** |

Cómo ejecutarlas (Node.js 18 o superior):

```bash
# 1. Lógica pura — no consume la API
node pruebas/pruebas-logica.js index.html

# 2. Integración — realiza unas 17 llamadas reales, dentro de los límites oficiales
node pruebas/pruebas-api.js index.html

# 3. Navegador real — requiere Playwright y Google Chrome instalado
npm install playwright
node pruebas/pruebas-navegador.js "RUTA/ABSOLUTA/index.html" "pruebas/capturas"
```

---

## 12. Mantenimiento

**Añadir un módulo nuevo.** Cuatro pasos, siguiendo el patrón existente:

1. Añada la ruta oficial a la constante `RUTAS` (§ 4).
2. Añada la pestaña en el `role="tablist"` y su `<section role="tabpanel">` (§ 2).
3. Registre el módulo en el objeto `MODULOS` (§ 9.4) para que funcionen «Limpiar» y «Nueva consulta».
4. Escriba `initMiModulo()` con el patrón *validar → `apiGet` → renderizar* y llámelo desde `init()` (§ 16).

**Cambiar el ritmo de consultas.** Ajuste `limiter.minIntervalMs` y `limiter.maxConcurrent` (§ 6). Nunca supere 10 solicitudes por segundo sostenidas.

**Cambiar la duración predeterminada de la caché.** Modifique `prefs.ttl` (§ 4) o utilice el selector de Configuración avanzada.

**Personalizar los colores institucionales.** Edite las variables `--brand-900`, `--brand-700` y `--brand-500` (§ 1.1); el resto del diseño se adapta automáticamente en ambos temas.

**Si el Ministerio cambia el formato de una respuesta.** La aplicación está construida de forma defensiva: los campos ausentes se omiten y las estructuras irreconocibles se muestran en crudo en lugar de fallar. Actualice la función `render…()` del módulo afectado y añada un caso a `pruebas/pruebas-api.js`.

---

## 13. Advertencias y limitaciones conocidas

Todas verificadas mediante peticiones reales el **29 de julio de 2026**.

**1. El servicio de tipo de cambio histórico responde 503.**
Todas las variantes probadas (rangos de 1, 3, 10 y 31 días; años 2024, 2025 y 2026; formatos `AAAA-MM-DD` y `dd/mm/aaaa`) devuelven `{"code":503,"status":"Service unavailable"}`. Sin parámetros devuelve 400, lo que confirma que `d` y `h` sí se reconocen: la indisponibilidad está en el servicio de origen, no en la petición. El módulo está implementado contra el contrato oficial y muestra un mensaje específico mientras dure la interrupción. Como no fue posible observar una respuesta correcta, el esquema exacto no está documentado por el Ministerio y **no se ha inventado**: la función `normalizarHistorico()` reconoce las formas razonables y, si ninguna encaja, presenta el JSON original sin interpretarlo.

Se confirmó que la ruta existe y que los parámetros son correctos: `/historico` sin parámetros devuelve **400**; con `D` y `H` en mayúscula, **400**; con `d` y `h` en minúscula, **503**. Una ruta inexistente devolvería 404, no 503. El fallo es del servidor.

*¿Por qué no se sustituye por el Banco Central?* Se evaluaron sus dos servicios:

| Servicio del BCCR | Resultado de la evaluación |
|---|---|
| Servicio web SOAP `gee.bccr.fi.cr/…/wsindicadoreseconomicos.asmx` | Exige **nombre, correo y token de suscripción personal en cada llamada**; es SOAP sin cabeceras CORS; y devolvía **503** durante la evaluación |
| API REST del portal de indicadores `apim.bccr.fi.cr/SDDE/api/…` | Existe y devuelve la serie diaria desde 1983, pero exige la cabecera **`token_csrf`** (un JWT que emite su propia aplicación) y su CORS está **restringido a `https://sdd.bccr.fi.cr`** |

Ninguno es utilizable. El primero obligaría a incrustar una credencial personal en una página pública, expuesta a todos los visitantes. El segundo es una **API interna no publicada**, con un control de acceso deliberado que esta aplicación no va a eludir: sería frágil, no está documentada y quedaría fuera de lo que el propio Ministerio autoriza consumir.

La solución adoptada es **enlazar, no consumir**: cuando el histórico de Hacienda falla, la aplicación ofrece un enlace directo al cuadro «Tipo cambio de compra y de venta del dólar» del portal del BCCR, que es la pantalla equivalente a este módulo, para que la persona usuaria lo consulte por su cuenta.

Además, el módulo **recuerda la caída durante 10 minutos**: si el servicio acaba de fallar, el aviso aparece de inmediato (23 ms medidos, frente a unos 7 segundos de reintentos) en lugar de repetir la espera, y se ofrece un botón «Comprobar de nuevo» que sí vuelve a consultar. En cuanto el Ministerio restablezca el servicio, el módulo funcionará sin ningún cambio en el código.

**2. `/fe/agropecuario` y `/fe/pesca` devuelven HTTP 200 al no encontrar registro.**
El cuerpo contiene `{"title":"Not Found","status":404}`. Una aplicación que sólo mirase el código HTTP mostraría ese error como si fuera un resultado válido. La función `detectarErrorIncrustado()` lo intercepta.

**3. No se localizó ningún caso positivo en los registros agropecuario y pesquero.**
Se probaron treinta y tantas identificaciones, incluida la que la propia documentación oficial usa como ejemplo (`2100042005`), cooperativas agrícolas y cédulas jurídicas y físicas variadas: todas devolvieron «no encontrado». Los registros parecen contener únicamente productores efectivamente inscritos. En consecuencia, la ruta de presentación de un resultado positivo se implementó de forma **genérica y defensiva**: se muestran los campos que efectivamente lleguen, con etiquetas derivadas del nombre de cada propiedad, sin agregar ni suponer ningún campo. Esta ruta no pudo ejercitarse con datos reales y así se hace constar.

*Vías exploradas para obtener un caso positivo, y por qué no prosperaron:*

| Vía | Resultado |
|---|---|
| Repositorio XLSX de personas registradas que publica el MAG | El enlace `www.mag.go.cr/consulta/Registro-Persona-y-Establecimientos.xlsx` devuelve **404** en el propio sitio del MAG |
| Consulta pública del MAG (`sistemasv2.mag.go.cr`) | Funciona, pero exige una cédula concreta: con la búsqueda vacía responde «Sin datos para mostrar». No permite listar |
| Consulta de establecimientos con CVO de SENASA | Protegida con reCAPTCHA Enterprise; no procede eludirla |
| Portal nacional de datos abiertos | No publica el registro de productores con identificaciones |

De esta exploración sí se obtuvieron dos resultados aprovechables, ya incorporados: la **regla del cero inicial** documentada más arriba, y los **nombres de campo del registro único** que muestra la herramienta del MAG (fuente de datos, tipo de registro, identificación, nombre de la persona productora, número de autorización, estado, fecha, vencimiento, dirección regional, agencia de extensión y tipo PYMPA), incorporados al diccionario de etiquetas. Ese diccionario sólo se aplica a las claves que realmente lleguen en la respuesta: no crea campos ni sugiere que existan.

Además, cuando la consulta no devuelve datos, la aplicación ofrece un **enlace** a la consulta pública del MAG y a los trámites del INCOPESCA, para que la persona usuaria verifique en la fuente institucional correspondiente.

**4. Los códigos 400 y 404 no incluyen cabeceras CORS.** Descrito en detalle en la [sección 4](#4-decisión-de-arquitectura-por-qué-no-se-requiere-un-proxy).

**5. El límite de 366 días del histórico es una decisión propia,** no una regla de la API: la documentación oficial no publica ningún límite de rango. Se aplica por prudencia y puede modificarse en la constante `LIMITE_DIAS_HISTORICO` (§ 11.2).

**6. Interpretaciones señaladas expresamente.** Tres elementos de la interfaz son elaboraciones locales y aparecen siempre acompañados del dato original y de una nota que lo aclara: la descripción del tipo de identificación (según el catálogo de facturación electrónica), el significado de las letras `A`/`I` y `P`/`S` de las actividades económicas, y el cálculo «Vigente / Vencida» de una exoneración, que compara la fecha de vencimiento con la del dispositivo.

**7. Disponibilidad.** La aplicación depende por completo de los servicios del Ministerio de Hacienda. Ni su disponibilidad, ni su exactitud, ni su continuidad están bajo control de esta herramienta.

**8. Carácter informativo.** Los resultados no sustituyen una certificación oficial. Para trámites formales, verifique siempre en los portales del Ministerio de Hacienda (ATV, EDDI, Exonet).

---

**Fuente de los datos:** Ministerio de Hacienda, República de Costa Rica — <https://api.hacienda.go.cr/docs>
**Soporte de la API oficial:** facturati@hacienda.go.cr

Esta aplicación es una interfaz de consulta independiente. No está afiliada al Ministerio de Hacienda ni cuenta con su respaldo, y no almacena, modifica ni certifica la información devuelta por sus servicios.
