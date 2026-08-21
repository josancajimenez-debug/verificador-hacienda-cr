# Verificador Hacienda CR

Aplicación web para consultar información pública mediante las **API oficiales del Ministerio de Hacienda de Costa Rica**.

Referencia técnica única: <https://api.hacienda.go.cr/docs>

**Un único archivo `index.html`, sin compilación ni archivos vecinos**: HTML, CSS, JavaScript, el logo de ACC Contadores y el icono del sitio van todos dentro. Funciona en computadoras, tabletas y teléfonos móviles.

**Acceso por membresía mensual.** Toda la aplicación queda detrás de un inicio de sesión: sólo puede usarla quien tenga una membresía activa (₡5.000 por mes calendario, pago por transferencia/depósito/SINPE confirmado manualmente por un administrador). El respaldo es [Supabase](https://supabase.com) (Postgres + Auth + Row Level Security) — es la única dependencia externa real del proyecto; sin ella el archivo sigue siendo autónomo para todo lo demás, pero nadie puede entrar. Vea la [sección 14](#14-membresía-mensual-supabase) para ponerla en marcha.

> **Nota sobre el tamaño.** El archivo pesa cerca de 12&nbsp;MB porque el [Módulo 9](#módulo-9--pymes-activas-búsqueda-local) incrusta 38&nbsp;106 registros del registro nacional de PYMES activas para poder buscarlos sin conexión. Es una decisión deliberada, no un descuido: los demás módulos pesan lo normal para un sitio de este tipo.

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
14. [Membresía mensual (Supabase)](#14-membresía-mensual-supabase)

---

## 1. Puesta en marcha en 30 segundos

**Uso inmediato.** Abra `index.html` con doble clic en cualquier navegador moderno (Chrome, Edge, Firefox, Safari). No hace falta instalar nada, ni levantar un servidor, ni acompañar el archivo de ninguna carpeta: la aplicación consulta directamente los servicios oficiales.

**Aplicación ya publicada:** <https://josancajimenez-debug.github.io/verificador-hacienda-cr/>

Ese enlace es público: puede compartirse por correo, WhatsApp o como material de un curso, y funciona en computadora, tableta y teléfono sin instalar nada.

**Para publicar su propia copia**, suba `index.html` a GitHub Pages, Netlify, Cloudflare Pages o cualquier alojamiento estático. Consulte la [sección 6](#6-publicación-y-forma-de-compartir-la-aplicación).

Requisitos del navegador: soporte de `fetch`, `async/await`, `Intl` y variables CSS. Cumple cualquier versión publicada desde 2020 aproximadamente.

---

## 2. Estructura del proyecto

```
VERIFICADOR/
├── index.html                 ← LA APLICACIÓN. Único archivo necesario:
│                                 lleva dentro el código, el logo y el icono.
├── ACC.CONTADORES.jpg         ← Logo original en alta resolución. La página NO
│                                 lo carga; se conserva como fuente para
│                                 regenerar la versión incrustada si hace falta.
├── README.md                  ← Este documento.
├── PRUEBAS.md                 ← Resultados y evidencia de las pruebas.
│
├── supabase/
│   └── schema.sql              ← Esquema, RLS y funciones de la membresía. Se ejecuta
│                                  una sola vez en el SQL Editor de su proyecto Supabase.
│
├── proxy/                     ← OPCIONAL. No se necesita para el uso normal.
│   ├── worker.js              ← Proxy para Cloudflare Workers.
│   └── server.js              ← Proxy equivalente en Node.js, sin dependencias.
│
└── pruebas/                   ← Bancos de prueba reproducibles y evidencia.
    ├── pruebas-logica.js      ← 107 pruebas de validadores, normalizadores, registros y preferencias.
    ├── pruebas-api.js         ← 16 pruebas de integración contra la API real.
    ├── pruebas-estructura.js  ← Auditorías del DOM (ids, ARIA, anidamiento, alt…).
    ├── pruebas-comportamiento.js ← Manual modal, acceso admin, paneles y teclado.
    ├── pruebas-navegador.js   ← Pruebas en Chrome (interfaz, a11y, móvil).
    ├── pruebas-calidad.js     ← Memoria, seguridad y contraste.
    ├── pruebas-recorrido.js   ← Recorrido exhaustivo de la interfaz, sin tolerar errores.
    ├── pruebas-membresia.js   ← Registro, pago, confirmación admin y bloqueo (Supabase real de pruebas).
    ├── pruebas-sitio-publicado.js ← Pruebas contra la URL pública ya desplegada.
    ├── _membresia-simulada.js ← Ayuda compartida: simula una sesión de Supabase sin red real,
    │                              para que el resto de los bancos "sin red" sigan siéndolo.
    └── capturas/              ← Capturas de pantalla y un CSV exportado real.
```

### Organización interna de `index.html`

El archivo está dividido en dieciséis secciones numeradas y comentadas. Busque el separador `== §` para navegar:

| Sección | Contenido |
|---|---|
| § 1 | Estilos: tokens de diseño, temas claro/oscuro, componentes, adaptación móvil |
| § 2 | Marcado de la interfaz (encabezado, pestañas, nueve paneles, pie) |
| § 3 | Utilidades DOM y de formato (`el()`, fechas, números, CSV, portapapeles) |
| § 4 | Configuración, rutas oficiales y catálogos |
| § 5 | Caché temporal en memoria |
| § 6 | Limitador de tasa y deduplicación de solicitudes |
| § 7 | Cliente HTTP: `apiGet()`, errores tipificados, timeout, reintentos, sonda CORS |
| § 8 | Componente `DataTable`: filtro, orden, paginación, CSV, copiado |
| § 9 | Infraestructura de interfaz: pestañas, tema, alertas, estado de red |
| § 9B | Membresía y autenticación: portal de acceso, Supabase Auth, panel admin de pagos |
| § 10–15D | Un bloque por módulo, nueve en total (validación → consulta → presentación) |
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

### Módulo 7 · Insumos con tarifa reducida del 1 % (búsqueda local)

A diferencia de los módulos anteriores, este no consulta ninguna API: busca sobre una lista de 703 registros transcrita de los cuatro anexos del Decreto Ejecutivo N.º 41824-H-MAG (insumos agropecuarios y veterinarios, maquinaria, insumos de pesca no deportiva y servicios a productores de Canasta Básica Tributaria), embebida en el propio `index.html`. Funciona sin conexión. El botón «Ver texto oficial y conceptos» abre el texto completo de la norma en SINALEVI (Procuraduría General de la República) en una pestaña nueva; es, junto con «Verificar comprobante» y «Asistente virtual», uno de los pocos enlaces de navegación externos que la aplicación ofrece de forma deliberada (véase la sección siguiente).

### Módulo 8 · Reglamento de CBTBIF (búsqueda local)

Igual que el módulo anterior, no consulta ninguna API: busca sobre una lista de 236 bienes transcrita del artículo 5 del texto vigente del Decreto Ejecutivo N.º 43790-H-MEIC-S, que reglamenta la lista de bienes de la Canasta Básica Tributaria por el Bienestar Integral de las Familias (CBTBIF) creada por la Ley N.º 9914, agrupados en sus 20 categorías oficiales (panes y cereales, lácteos, carnes, aceites, frutas y vegetales, artículos de higiene y limpieza del hogar, entre otras), embebida en el propio `index.html`. Funciona sin conexión. El botón «Ver texto oficial y conceptos» abre el texto completo de la norma en SINALEVI en una pestaña nueva, con la misma naturaleza de enlace de navegación deliberado que el del Módulo 7.

### Módulo 9 · PYMES activas (búsqueda local)

Busca por cédula, nombre o razón social sobre una copia local de 38 106 registros del reporte oficial de PYMES activas del Ministerio de Economía, Industria y Comercio (MEIC), con corte al 31 de julio de 2026, embebida en el propio `index.html`. Funciona sin conexión, con un filtro adicional por provincia. Es la única excepción a la regla de "no incrustar el registro completo" que se explica más abajo: aun sabiendo que el archivo pesa más de 11 MB y que quedará fijo en ese corte, se optó por incrustarlo porque así se pidió explícitamente, con conocimiento del costo en tamaño y de que no se actualiza solo.

Los datos se descargaron directamente del CSV oficial que publica el MEIC (mismo dominio que la página de transparencia), no de una conversión de PDF: un primer intento de usar un archivo convertido a Markdown resultó en texto corrupto (nombres y cédulas repetidos sin sentido, típico de una OCR fallida) y se descartó antes de escribir una sola línea de datos en la aplicación — la misma exigencia de "solo datos reales verificables" que rige el resto de la aplicación.

Para la condición vigente el día de la consulta (este listado es una fotografía fija del 31 de julio de 2026, no se actualiza sola), el botón "Ver publicación oficial" del propio módulo lleva a la página de transparencia del MEIC, en `meic.go.cr/transparencia/apoyo-a-la-pequena-y-mediana-empresa/lista-de-pymes-activas/`, donde se publican por mes los archivos descargables (.ods, .pdf, .csv, .xls). El MEIC también publica, en `meic.go.cr/tramites-y-servicios/pymes-activas/`, una tabla en vivo (buscable por nombre o cédula, actualizada a diario) con el mismo registro; no es la página enlazada por el módulo —se prefirió apuntar a la fuente de transparencia oficial que referencia la bibliografía—, pero es la opción a considerar si en el futuro se prioriza esa tabla en vivo sobre la descarga del listado mensual completo.

### Verificar comprobante · acceso directo en la barra de pestañas (sin panel propio)

Al final de la barra de pestañas, marcado con ↗ y borde discontinuo para distinguirlo de un módulo real, hay un enlace «Verificar comprobante» que no abre un panel de consulta: lleva directamente al verificador oficial de comprobantes electrónicos del Ministerio de Hacienda, en `ovitribucr.hacienda.go.cr/tico/comprobante/comprobante-electronico/`.

### Accesos externos de la cabecera

Además de los nueve módulos de consulta y del enlace «Verificar comprobante», la barra de herramientas ofrece un acceso que **no es un endpoint**: un enlace que se abre en una pestaña nueva, con `rel="noopener noreferrer"`.

| Botón | Destino | Para qué sirve |
|---|---|---|
| 💬 Asistente virtual | `josancajimenez-debug.github.io/acc-asistente/` | Asistente Virtual de ACC Contadores: consultas contables y tributarias, agendamiento de citas, cotizaciones y facturación electrónica |

El Asistente virtual está también accesible desde el pie de página, junto a los datos de contacto, para quien llegue al final de una consulta y necesite acompañamiento profesional para interpretar el resultado.

### Base normativa de los paneles informativos

Cada módulo incluye un panel plegable «Significado, uso, aplicación e importancia» con la explicación de su alcance y su fundamento legal. Al pie de cada panel figuran las **citas en formato APA** de las fuentes consultadas, y al final de la página la lista completa de referencias.

Las citas se presentan **como texto, no como enlaces a archivos**. La bibliografía es el respaldo documental con el que se redactaron las explicaciones; la aplicación no la distribuye. Cada norma citada es de acceso público y puede obtenerse en el sitio de la institución que la publica: el Sistema Costarricense de Información Jurídica para leyes y decretos, y el portal del Ministerio de Hacienda para las resoluciones y los anexos de facturación electrónica.

Esta decisión mantiene además la propiedad más útil del proyecto: **`index.html` es un archivo verdaderamente autónomo**, que se puede enviar suelto sin que nada quede roto.

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

Por lo tanto **la consulta a Hacienda en sí no requiere backend propio**: `index.html` sigue siendo publicable en GitHub Pages y compartible mediante un simple enlace, con todo ese código integrado en el propio archivo.

**Esto es independiente de la membresía.** El acceso a la aplicación (registro, login, pagos, bloqueo por vencimiento) sí necesita un lugar donde guardar usuarios y contraseñas de forma segura y persistente entre dispositivos — algo que un archivo estático no puede hacer por sí solo. Para eso se usa Supabase (sección 14): la razón por la que un `index.html` sin backend basta para *consultar Hacienda* no aplica a *quién puede entrar a hacerlo*, que es un problema distinto.

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
6. En la aplicación, pulse **Acceso admin**, ingrese la contraseña y, en **Configuración avanzada**, pegue la URL en «URL de su propio proxy». Guarde.

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

Después, desbloquee **Acceso admin** y, en **Configuración avanzada**, escriba `http://localhost:8787`.

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
| **Por correo o memoria USB** | Envíe únicamente `index.html`; se abre con doble clic y el logo va dentro. Requiere conexión sólo para consultar la API. |

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

- **No se almacena ningún número de identificación consultado.** La caché de resultados reside exclusivamente en un `Map` en memoria: desaparece al recargar la página, al cerrar la pestaña o al pulsar «Limpiar caché».
- **`localStorage` sólo guarda dos cosas, ninguna un dato de consulta.** La clave `verificadorHaciendaCR.prefs` (tema visual, duración de la caché y, si se configura, la dirección del proxy propio) y, únicamente si el navegador tiene una sesión de membresía abierta, la clave de sesión propia del SDK de Supabase (`sb-<referencia-del-proyecto>-auth-token`) — un token de acceso, no datos de las consultas que usted haga dentro de la app. Comprobado automáticamente (véase `PRUEBAS.md`).
- **El destino de las peticiones son dos, y ambos declarados aquí.** `api.hacienda.go.cr` (o el proxy que usted mismo despliegue) para las consultas, y su propio proyecto Supabase para el inicio de sesión y el estado de la membresía. Ningún otro tercero recibe tráfico de la aplicación.
- **Datos personales del registro (nombre, cédula, teléfono, correo y, si aplica, dirección y actividad económica) sólo se guardan en su proyecto Supabase**, protegidos por Row Level Security: cada quien sólo puede leer su propio perfil; un administrador puede leer los perfiles asociados a un pago pendiente de confirmar. Ver `supabase/schema.sql`.
- **Sin analítica, sin cookies propias.** La página no carga fuentes ni imágenes de otros dominios; el único recurso externo es el SDK de Supabase (`cdn.jsdelivr.net`), imprescindible para la membresía. Se declara `referrer: no-referrer`.
- **Las credenciales del navegador no se envían hacia Hacienda:** las peticiones a `api.hacienda.go.cr` usan `credentials: "omit"`. Las peticiones a Supabase sí llevan la cabecera de autorización de su propia sesión — es indispensable para que la membresía funcione, y es tráfico hacia su propio proyecto, no hacia un tercero ajeno.
- **Prevención de inyección de contenido:** ningún dato recibido de la API ni de Supabase se inserta con `innerHTML`. Todo el contenido dinámico se construye con `document.createElement` y `textContent`.
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
| Lógica pura (validadores, normalizadores, clasificadores, preferencias) | 107 | 107 correctos |
| Integración contra la API oficial | 16 | 16 correctos |
| Estructura y accesibilidad del DOM | 13 | 13 correctos |
| Comportamiento (manual modal, acceso admin, paneles, teclado) | 35 | 35 correctos |
| Calidad: memoria, seguridad y contraste | 14 | 14 correctos |
| Recorrido exhaustivo (consola limpia) | 49 pasos | correctos |
| Navegador real (Chrome: interfaz, accesibilidad, móvil) | 58 | 58 correctos |
| Membresía (registro, pago, confirmación admin, bloqueo) | 15 | requiere un proyecto Supabase de pruebas — ver sección 14 |
| Sitio publicado (URL pública real) | 10 | 10 correctos |

Los bancos que ejercitan la interfaz dentro de `#contenido` (estructura, comportamiento, calidad, recorrido, navegador) simulan una sesión de membresía sin tocar ningún servidor real — ver `pruebas/_membresia-simulada.js` — porque toda la app quedó detrás del login y esos bancos siguen queriendo ser "sin red".

### Pruebas automáticas en cada publicación

El repositorio incluye un flujo de integración continua (`.github/workflows/pruebas.yml`) con dos jobs:

- **`sin-red`**, en cada `git push` a `main` y en cada propuesta de cambio: comprueba la sintaxis del script, que no aparezca ninguna API de inserción de HTML, que no se haya colado ningún recurso externo fuera de la allowlist, y ejecuta los bancos de **lógica**, **estructura** y **comportamiento** (con la sesión simulada de arriba).
- **`membresia`**: ejecuta `pruebas-membresia.js` contra un proyecto Supabase dedicado exclusivamente a pruebas, usando tres secretos del repositorio (`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY` — sección 14). Si no están configurados, el banco se omite con un aviso en vez de fallar.

**Los bancos que consultan la API de Hacienda no se ejecutan en CI, y es deliberado.** El motivo no es el tiempo, sino la política de uso del Ministerio: bloquea por dirección IP y advierte expresamente del riesgo de las «arquitecturas en la nube, donde cientos de clientes acceden desde un mismo servidor, concentrando el tráfico en una sola IP». Los runners de GitHub comparten sus direcciones entre miles de proyectos; lanzar consultas desde ahí sería exactamente ese anti-patrón, y un bloqueo perjudicaría a terceros ajenos a este proyecto. Supabase no tiene esa política, por eso su banco sí corre en CI.

Por eso la regla es: **antes de publicar, ejecute la suite completa en su equipo**, que sale con su propia dirección IP.

```bash
npm test            # los siete bancos locales
npm run test:sitio  # contra la URL pública, después de publicar
```

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

**Cambiar la duración predeterminada de la caché.** Utilice el selector de Configuración avanzada o, para cambiar el valor de fábrica, modifique `TTL_PREDETERMINADO` (§ 4). Si añade una duración nueva, agréguela **a la vez** a `TTL_ADMITIDOS` y a las opciones del `<select id="cfg-ttl">`: esa constante es la lista blanca con la que se validan las preferencias leídas de `localStorage`, y una duración que no figure en ella se sustituye por la predeterminada.

**Acceso a la configuración avanzada.** La contraseña de reparto es `Hacienda-CR-1262!`. El navegador la verifica mediante PBKDF2-SHA-256 (210 000 iteraciones); sólo la sal y el hash están en `ADMIN_AUTH`, la contraseña nunca se guarda en texto legible, y el desbloqueo vive en `sessionStorage` hasta cerrar la pestaña o pulsar «Cerrar admin».

> ⚠️ **Esta contraseña es pública.** Está escrita en este archivo, que se publica junto a la aplicación en un repositorio abierto: cualquiera que lea el README puede abrir el panel. Mientras no se cambie, el control **sólo evita el manejo accidental**, no el acceso deliberado.

Para generar una sal y un hash nuevos, cambie `SU-CONTRASEÑA` y ejecute:

```bash
node -e "const c=require('crypto');const s=c.randomBytes(16);console.log('salt:',s.toString('base64'));console.log('hash:',c.pbkdf2Sync('SU-CONTRASEÑA',s,210000,32,'sha256').toString('base64'))"
```

Copie ambos valores en `ADMIN_AUTH` (§ 4 de `index.html`) y **no escriba la contraseña nueva en ningún archivo del repositorio**. Los bancos de pruebas la leen de la variable de entorno `ADMIN_PASSWORD`:

```bash
ADMIN_PASSWORD='SU-CONTRASEÑA' npm test
```

Aun con una contraseña privada, al tratarse de una aplicación estática este control evita el acceso casual pero **no sustituye una autenticación de servidor**: quien pueda editar el JavaScript en su propio navegador puede omitirlo. Conviene recordar qué protege realmente: los dos ajustes del panel —duración de la caché y dirección de un proxy propio— se guardan en el `localStorage` de cada visitante y sólo afectan a su propia sesión. No hay allí ningún secreto ni configuración compartida. Para proteger algo que sí lo sea, el área administrativa debe trasladarse a un backend autenticado.

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

**3 bis. El registro pesquero ya está verificado con datos reales.**
Con dos identificaciones que sí figuran ante INCOPESCA se pudo observar por fin la respuesta de `/fe/pesca` cuando hay datos. Devuelve **tres registros en una sola respuesta**, cada uno con su indicador de actividad y su fecha de vencimiento:

```json
{ "listaDatosMAG": [],
  "listaDatosIncopesca": [ { "nombrePermisonarioIncopesca": "…",
                             "fechaVenceIncopesca": "2023-06-28",
                             "indicadorActivoIncopesca": false } ],
  "listaDatosAcuicultores": [] }
```

Esto obligó a corregir un **defecto grave**: la aplicación anunciaba «Registro encontrado» con distintivo verde para un permiso inactivo y vencido. En un despacho contable esa lectura induce a aplicar la tarifa reducida del 1 % a quien ya no tiene derecho. **Figurar en el registro no equivale a estar habilitado.**

La aplicación distingue ahora ambas cosas: el resultado indica «Figura en el registro (N asientos)» con distintivo neutro y, aparte, la **condición**, en verde sólo si algún asiento está activo y sin vencer. Si figura sin vigencia, un aviso en rojo explica el motivo concreto y advierte de no aplicar tratamientos reservados sin confirmarlo con la institución. El criterio es conservador: vigente sólo si el indicador es afirmativo **y** la fecha no ha pasado.

**3 ter. El registro agropecuario también está verificado con datos reales.**
`/fe/agropecuario` devuelve una única lista, con nombres de campo distintos a los de pesca:

```json
{ "listaDatosMAG": [ { "nombreMAG": "…",  "estadoMAG": "Activo",
                       "fechaAltaMAG": "2026-06-17", "fechaBajaMAG": "2028-06-17",
                       "indicadorActivoMAG": true,   "fuenteMAG": "MAG" } ] }
```

Dos detalles obligaron a afinar la lógica de vigencia:

- **La fecha de término se llama `fechaBajaMAG`, no «vence».** La versión anterior sólo buscaba campos con «vence», «vencimiento» o «expira», de modo que ignoraba la fecha y se apoyaba únicamente en el indicador booleano. Un asiento marcado como activo pero ya vencido se habría presentado como vigente.
- **Junto a ella viaja `fechaAltaMAG`, que es la fecha de inicio.** Tomarla por vencimiento invertiría el resultado, así que se excluye expresamente.

Se añadió además el estado textual (`estadoMAG`: «Activo», «Vigente») como señal adicional: un estado desfavorable manda sobre el indicador booleano, porque ante señales contradictorias no debe afirmarse la vigencia.

Una misma identificación puede traer **varios asientos de fuentes distintas** —se observaron MAG y SENASA en la misma respuesta—, y cada uno se evalúa por separado. La columna «Registro de origen» muestra de cuál procede.

**3. Limitación que se mantiene, ya acotada.**
Los cuatro casos observados con datos reales fueron: dos permisos de INCOPESCA **inactivos y vencidos**, y dos registros del MAG **activos y vigentes**. No se ha observado todavía un asiento del MAG en estado desfavorable ni ningún registro de acuicultores, de modo que esas dos variantes se apoyan en la misma lógica pero no han podido comprobarse contra el servicio.

La lógica de vigencia está construida para ser conservadora ante lo desconocido: si los campos no permiten determinar la condición, se indica «No determinable» y el aviso favorable no se emite. Las catorce pruebas de vigencia cubren las combinaciones de indicador, fecha y estado textual con datos ficticios.

*Cómo se llegó a los casos positivos.* Las vías automatizables no prosperaron —el XLSX del registro devuelve **404** en el propio sitio del MAG, su consulta pública exige una cédula concreta y la de SENASA está tras reCAPTCHA—, de modo que los casos los aportó quien usa la herramienta. **Ninguna de esas identificaciones figura en el repositorio ni en las pruebas:** los bancos reproducen la estructura con datos ficticios.

De esta exploración sí se obtuvieron dos resultados aprovechables, ya incorporados: la **regla del cero inicial** documentada más arriba, y los **nombres de campo del registro único** que muestra la herramienta del MAG (fuente de datos, tipo de registro, identificación, nombre de la persona productora, número de autorización, estado, fecha, vencimiento, dirección regional, agencia de extensión y tipo PYMPA), incorporados al diccionario de etiquetas. Ese diccionario sólo se aplica a las claves que realmente lleguen en la respuesta: no crea campos ni sugiere que existan.

Además, cuando la consulta no devuelve datos, la aplicación ofrece un **enlace** a la consulta pública del MAG y a los trámites del INCOPESCA, para que la persona usuaria verifique en la fuente institucional correspondiente.

**4. Los códigos 400 y 404 no incluyen cabeceras CORS.** Descrito en detalle en la [sección 4](#4-decisión-de-arquitectura-por-qué-no-se-requiere-un-proxy).

**5. El límite de 366 días del histórico es una decisión propia,** no una regla de la API: la documentación oficial no publica ningún límite de rango. Se aplica por prudencia y puede modificarse en la constante `LIMITE_DIAS_HISTORICO` (§ 11.2).

**6. Interpretaciones señaladas expresamente.** Tres elementos de la interfaz son elaboraciones locales y aparecen siempre acompañados del dato original y de una nota que lo aclara: la descripción del tipo de identificación (según el catálogo de facturación electrónica), el significado de las letras `A`/`I` y `P`/`S` de las actividades económicas, y el cálculo «Vigente / Vencida» de una exoneración, que compara la fecha de vencimiento con la del dispositivo.

**7. Disponibilidad.** La aplicación depende por completo de los servicios del Ministerio de Hacienda. Ni su disponibilidad, ni su exactitud, ni su continuidad están bajo control de esta herramienta.

**8. Carácter informativo.** Los resultados no sustituyen una certificación oficial. Para trámites formales, verifique siempre en los portales del Ministerio de Hacienda (ATV, EDDI, Exonet).

---

## 14. Membresía mensual (Supabase)

Toda la aplicación queda detrás de un inicio de sesión. Esta sección explica cómo ponerla en marcha y cómo funciona por dentro.

### 14.1 Puesta en marcha

1. Cree una cuenta y un proyecto gratuito en [supabase.com](https://supabase.com).
2. En el **SQL Editor** del proyecto, ejecute el contenido de [`supabase/schema.sql`](supabase/schema.sql) una sola vez. Crea las tablas `profiles` y `payments`, el disparador que da de alta el perfil al registrarse, la función `confirm_payment()` y las políticas de Row Level Security.
3. Confirme que **Authentication → Providers → Email → "Confirm email"** está activo (lo está por defecto): sin eso, cualquiera podría registrarse con un correo ajeno.
4. En `index.html`, busque las constantes `SUPABASE_URL` y `SUPABASE_ANON_KEY` (§ 4) y reemplace los dos marcadores `"PENDIENTE_SUPABASE_URL"` / `"PENDIENTE_SUPABASE_ANON_KEY"` por los de su proyecto (**Project Settings → API**). Mientras sigan como marcadores, la aplicación se degrada a un aviso claro en la pantalla de ingreso en vez de romperse — no publique así, pero tampoco es un archivo inservible mientras lo configura.
5. En **Authentication → URL Configuration**, cambie **Site URL** (que por defecto es `http://localhost:3000`) por la URL pública donde queda publicada la aplicación (por ejemplo `https://usuario.github.io/repositorio/`), y añádala también en **Redirect URLs**. Si se omite este paso, los enlaces que Supabase envía por correo — confirmación de registro y «¿Olvidó su contraseña?» — apuntan a `localhost:3000` y fallan con `ERR_CONNECTION_REFUSED` en cuanto la persona los abre desde su propio computador.
6. Regístrese normalmente desde la propia aplicación y, en el SQL Editor, asígnese el rol de administrador:
   ```sql
   update public.profiles set role = 'admin' where id =
     (select id from auth.users where email = 'su-correo@ejemplo.com');
   ```

### 14.2 El "anon key" es público a propósito

Al igual que la contraseña de reparto de la sección 12, el `anon key` de Supabase **no es un secreto** que deba ocultarse: es la llave con la que el navegador de cualquier visitante habla con su proyecto, y está pensada para viajar dentro del propio código del cliente. La protección real de los datos son las políticas de **Row Level Security** en `supabase/schema.sql`: cada persona sólo puede leer su propio perfil, insertar sus propios pagos y nunca puede asignarse a sí misma el rol de administrador (el permiso de `UPDATE` sobre esa columna está revocado para el rol `authenticated`). Lo único que sí debe permanecer secreto es la **service role key** de su proyecto, que nunca se usa dentro de `index.html` — sólo la necesita, del lado del servidor, el banco de pruebas `pruebas-membresia.js`.

### 14.3 Contraseña admin y panel de membresías comparten un solo interruptor

La contraseña admin pública de la sección 12 ahora revela dos cosas: la configuración avanzada de siempre, y el nuevo **panel de administración de membresías** (cola de pagos pendientes, documento a emitir por cada uno). Es una unificación deliberada: no se creó un segundo sistema de acceso para no duplicar la experiencia de quien administra el sitio. La seguridad real no depende de esa contraseña — los botones «Confirmar»/«Rechazar» llaman a `confirm_payment()`, que sólo tiene efecto si la sesión de Supabase activa en ese momento tiene `role = 'admin'` en la base de datos; conocer la contraseña pública sin esa sesión no permite alterar ningún pago.

### 14.4 Proyecto de pruebas (para `pruebas-membresia.js` y CI)

El banco `pruebas-membresia.js` ejercita el flujo completo (registro → confirmación de correo → bloqueo sin pago → envío de referencia → confirmación por un administrador → acceso reactivado) contra un proyecto Supabase **real, pero dedicado exclusivamente a pruebas** — nunca el de producción. Cree un segundo proyecto igual que el de producción (mismo `supabase/schema.sql`) y exporte, antes de correr `npm test` o `npm run test:membresia`:

```bash
export SUPABASE_TEST_URL="https://xxxxxxxx.supabase.co"
export SUPABASE_TEST_ANON_KEY="..."
export SUPABASE_TEST_SERVICE_ROLE_KEY="..."   # sólo se usa en Node, nunca llega al navegador
```

Para que también corra en integración continua, cargue esas mismas tres variables como secretos del repositorio (**Settings → Secrets and variables → Actions**) con los nombres `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` y `SUPABASE_TEST_SERVICE_ROLE_KEY`. El job `membresia` de `.github/workflows/pruebas.yml` los usa automáticamente; si faltan, ese banco se omite con un aviso en vez de fallar la build.

### 14.5 Especificación funcional completa

El flujo de usuario, los campos, las reglas de negocio, los estados de la membresía y los criterios de aceptación se documentaron por separado, con sus supuestos explícitos, antes de implementarse. Esta sección cubre la puesta en marcha técnica; para el porqué de cada decisión de producto, consulte esa especificación.

---

**Fuente de los datos:** Ministerio de Hacienda, República de Costa Rica — <https://api.hacienda.go.cr/docs>
**Soporte de la API oficial:** facturati@hacienda.go.cr

Esta aplicación es una interfaz de consulta independiente. No está afiliada al Ministerio de Hacienda ni cuenta con su respaldo, y no almacena, modifica ni certifica la información devuelta por sus servicios.
