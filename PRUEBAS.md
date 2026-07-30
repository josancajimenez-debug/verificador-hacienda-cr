# Evidencia de pruebas — Verificador Hacienda CR

Fecha de ejecución: **30 de julio de 2026**
Entorno: Windows 11 Pro · Node.js v24.18.0 · Google Chrome (Playwright 1.62)
API consultada: `https://api.hacienda.go.cr` (servicios oficiales, sin datos simulados)

| Banco de pruebas | Casos | Correctos | Fallidos |
|---|---:|---:|---:|
| 1 · Lógica pura | 107 | 107 | 0 |
| 2 · Integración con la API oficial | 16 | 16 | 0 |
| 3 · Estructura y accesibilidad del DOM | 13 | 13 | 0 |
| 4 · Comportamiento (manual modal, acceso admin, paneles, teclado) | 35 | 35 | 0 |
| 5 · Calidad: memoria, seguridad y contraste | 14 | 14 | 0 |
| 6 · Recorrido exhaustivo (46 pasos, consola limpia) | 46 | 46 | 0 |
| 7 · Navegador real (Chrome) | 58 | 58 | 0 |
| 8 · Sitio publicado (URL pública real) | 10 | 10 | 0 |
| **Total** | **299** | **299** | **0** |

Todos los bancos son reproducibles; los comandos figuran al final de cada sección.

---

## Revisión integral del 30 de julio de 2026

Auditoría completa del código (marcado, estilos, script, proxy y bancos de
prueba) en busca de defectos de lógica, presentación, rendimiento y seguridad.
Se corrigieron **nueve defectos**, todos reproducidos antes de tocar el código y
verificados después. Los cinco primeros afectaban a lo que ve la persona usuaria.

| # | Defecto | Causa raíz | Efecto observado |
|---|---|---|---|
| 1 | La consulta tributaria anunciaba éxito sobre un panel vacío | `initTributaria` mostraba el aviso favorable sin comprobar si `renderTributaria` llegó a pintar algo; la advertencia de la función se borraba acto seguido | Con un cuerpo JSON válido pero sin ficha (`null`, un arreglo, un número) se leía «✅ Consulta realizada» sin ningún dato |
| 2 | Se restauraba un proxy inseguro desde `localStorage` | La validación de esquema sólo existía en la ruta de guardado, no en la de lectura | Un valor persistido por una versión anterior o manipulado desviaba **todas** las consultas —con los números de identificación— a un servidor arbitrario |
| 3 | Una duración de caché fuera del catálogo apagaba la caché en silencio | `loadPrefs` aceptaba cualquier número; el `<select>` quedaba sin opción marcada y `parseInt("")` daba `NaN`, que `\|\| 0` convertía en «sin caché» | El desplegable aparecía en blanco y, al guardar, se perdía la caché sin aviso |
| 4 | El campo CABYS conservaba la marca de error al cambiar de modalidad | `sincronizarModoCabys` limpiaba el mensaje pero no el `aria-invalid` de los dos campos | El campo volvía a mostrarse con borde rojo y anunciado como inválido, sin mensaje que lo explicara |
| 5 | La columna «Vigencia (cálculo local)» no ordenaba | Es un valor derivado, no un campo de la fila: sin `sortValue`, el orden leía `fila["_vigencia"]` (`undefined`) en todas las filas | El encabezado se comportaba como un botón que no hacía nada |
| 6 | El plazo de espera corría durante la cola del limitador | El temporizador se armaba antes de `limiter.run`, no dentro de la tarea | Con varias consultas encoladas, una podía agotar su plazo sin haberse enviado, y el mensaje culpaba al Ministerio |
| 7 | La sonda de conectividad dejaba temporizadores pendientes | `clearTimeout` sólo estaba en la ruta de éxito | Un temporizador de 8 s por cada sonda fallida |
| 8 | Un impuesto CABYS no numérico envenenaba el orden | `Number("n/a")` daba `NaN`, que se filtraba como celda vacía pero rompía las comparaciones | Orden indefinido en la columna IVA |
| 9 | El banco estructural nunca hacía fallar la integración continua | Imprimía las incidencias y terminaba siempre con código 0 | Una regresión estructural (id duplicado, referencia ARIA rota, panel anidado) dejaba la publicación en verde |

### Cómo se verificó cada corrección

Los defectos 1 a 5 se reprodujeron en Chrome con una sonda dirigida antes de
corregir nada, y las mismas comprobaciones se incorporaron a los bancos
permanentes para que no puedan repetirse:

| Defecto | Antes | Después | Prueba que lo fija |
|---|---|---|---|
| 1 | `«✅ Consulta realizada»` con 0 elementos | `«⚠️ Respuesta vacía»` | Banco 4 · 3 casos (`null`, arreglo, número) |
| 2 | `prefs.proxy = "http://atacante.example"` | `prefs.proxy = ""` | Banco 1 · 9 casos de `proxyEsSeguro` |
| 3 | `value=""`, `selectedIndex=-1`, guardar → `ttl=0` | `value="600000"`, guardar → `ttl=600000` | Banco 1 · 7 casos de `normalizarTtl` |
| 4 | `aria-invalid="true"` persistía | atributo ausente | Banco 4 · 2 casos |
| 5 | `[Ana, Beto, Cira]` → `[Ana, Beto, Cira]` | `[Vigente, No vigente, No vigente]` | Banco 4 · 2 casos |

### Limpieza aplicada en la misma revisión

- Se retiró el atributo `data-panel` de las seis pestañas: ningún código lo leía
  (la navegación se resuelve con `aria-controls`).
- Se retiró el campo `_origen` de las filas de CABYS: se copiaba el objeto
  completo de la API en cada fila sin que nada lo consultara.
- Se trasladaron a clases los diez estilos en línea que quedaban en el marcado y
  los dos que el script aplicaba por `element.style`. El marcado ya no contiene
  ningún atributo `style`. Se comprobó con una sonda de estilos calculados que
  cada clase reproduce exactamente el valor anterior; el proceso detectó que
  `legend.modo-busqueda__titulo` necesitaba cualificarse con el elemento para no
  perder ante `.dl__k`, que fija su propio margen.
- `hoyISO()` pasó del módulo de tipo de cambio a las utilidades de fecha, junto a
  `fmtFecha` e `isoDatePart`, que es donde se usa. `fileStamp()` dejó de duplicar
  el relleno de dos dígitos y ahora lee el reloj una sola vez.

---

## 0. Verificación previa de los endpoints

Antes de escribir la aplicación se comprobó cada endpoint con `curl`, para no asumir ningún campo ni comportamiento.

| Endpoint | Estado | Observación |
|---|---|---|
| `/fe/ae` | Operativo | `Access-Control-Allow-Origin: *` en respuestas 200 |
| `/indicadores/tc/dolar` | Operativo | Objeto con `compra` y `venta` |
| `/indicadores/tc/dolar/historico` | **503** | Indisponible en todas las variantes probadas |
| `/fe/ex` | Operativo | Acepta el número en minúsculas |
| `/fe/agropecuario` | Operativo | Devuelve **HTTP 200** con cuerpo de error 404 |
| `/fe/pesca` | Operativo | Igual comportamiento que el anterior |
| `/fe/cabys?codigo=` | Operativo | Devuelve un arreglo; `[]` si no existe |
| `/fe/cabys?q=&top=` | Operativo | Devuelve `{total, cantidad, cabys[]}` |

### Hallazgo determinante para la arquitectura: CORS parcial

Respuesta correcta — **incluye** cabecera CORS:

```
$ curl -s -D - -H "Origin: https://example.com" \
    "https://api.hacienda.go.cr/fe/ae?identificacion=4000042139" | head -4
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
X-Origin-App: api.hacienda.go.cr
X-Origin-Route: GET /fe/ae
```

Respuesta 404 — **no** incluye cabecera CORS:

```
$ curl -s -D - -H "Origin: https://example.com" \
    "https://api.hacienda.go.cr/fe/ae?identificacion=3101002949" | head -6
HTTP/1.1 404 Not Found
Content-Type: application/json
ETag: "80b9a95465175ba8c640d13b727f7fec:1759165994.760751"
Server: AkamaiNetStorage
Cache-Control: max-age=0, no-cache, no-store
                          ← sin Access-Control-Allow-Origin
```

Conclusión: se entrega un `index.html` autónomo (CORS habilitado en respuestas 200) y se resuelve el caso 400/404 mediante una sonda de conectividad. Detalle en `README.md`, sección 4.

### Comprobación del histórico (503)

```
$ curl -s "…/historico?d=2026-07-20&h=2026-07-22"   → {"code":503,"status":"Service unavailable"}
$ curl -s "…/historico?d=2025-01-01&h=2025-01-05"   → {"code":503,"status":"Service unavailable"}
$ curl -s "…/historico?d=2024-01-01&h=2024-01-31"   → {"code":503,"status":"Service unavailable"}
$ curl -s "…/historico?d=2026-07-28&h=2026-07-28"   → {"code":503,"status":"Service unavailable"}
$ curl -s "…/historico?d=01/07/2026&h=10/07/2026"   → {"code":503,"status":"Service unavailable"}
$ curl -s "…/historico"                             → {"code":400,"status":"Bad request"}
```

El 400 sin parámetros confirma que `d` y `h` se reconocen: la indisponibilidad está en el servicio de origen, no en la construcción de la petición.

---

## 0 bis. Investigación de fuentes complementarias

Se evaluaron dos portales institucionales para intentar resolver las dos limitaciones detectadas: la indisponibilidad del histórico de tipo de cambio y la ausencia de un caso positivo en los registros agropecuario y pesquero.

### Banco Central de Costa Rica — histórico de tipo de cambio

Punto de partida: <https://www.bccr.fi.cr/SitePages/Inicio.aspx>

**Primero se descartó que el fallo fuese de esta aplicación.** Se repitió el ejemplo publicado en la propia documentación del Ministerio y varias variantes de ruta y parámetros:

```
/indicadores/tc/dolar/historico?d=2019-12-01&h=2019-12-09   → 503   (ejemplo oficial)
/indicadores/tc/dolar/historico/?d=2019-12-01&h=2019-12-09  → 503
/indicadores/tc/dolar/Historico?d=2019-12-01&h=2019-12-09   → 503
/indicadores/tc/dolar/historico?D=2019-12-01&H=2019-12-09   → 400   (parámetros en mayúscula)
/indicadores/tc/historico?d=2019-12-01&h=2019-12-09         → 404   (ruta inexistente)
/indicadores/historico/tc/dolar?d=2019-12-01&h=2019-12-09   → 404   (ruta inexistente)
```

La ruta existe (503, no 404) y los parámetros en minúscula se reconocen (los de mayúscula dan 400). **El fallo está en el servidor del Ministerio.** También se comprobó que el recurso diario no admite fecha: `/indicadores/tc/dolar?fecha=2026-07-20`, `?d=`, `?f=` y `?date=` devuelven siempre el tipo de cambio del día en curso, por lo que no es posible reconstruir la serie día a día.

**Evaluación de los dos servicios del BCCR:**

| Servicio | Resultado |
|---|---|
| SOAP `gee.bccr.fi.cr/…/wsindicadoreseconomicos.asmx?WSDL` | **HTTP 503**, sin cabeceras CORS |
| SOAP `ObtenerIndicadoresEconomicosXML` con nombres de parámetro correctos | **HTTP 503** |
| Requisitos de acceso del SOAP | Nombre, correo y **token de suscripción personal** en cada llamada |
| REST `apim.bccr.fi.cr/SDDE/api/…/ObtenerDatosCuadro` | **HTTP 200 en el navegador**, 500 desde fuera |

El servicio REST se localizó capturando el tráfico del portal de indicadores del BCCR con un navegador real. Devuelve la serie diaria del dólar desde 1983 (`IdGrupoVariable=1`), pero el análisis de sus cabeceras muestra que no es utilizable:

```
Petición   token_csrf: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…   ← JWT emitido por su propia aplicación
Respuesta  access-control-allow-origin: https://sdd.bccr.fi.cr ← CORS restringido a su dominio
           access-control-allow-credentials: true
```

**Conclusión: ninguno de los dos es viable, por motivos distintos.** El SOAP obligaría a incrustar una credencial personal en una página pública, visible para cualquier visitante. El REST es una **API interna no publicada**, cuyo control de acceso (JWT propio y CORS restringido a su dominio) es deliberado; eludirlo sería frágil, quedaría fuera de lo que el BCCR autoriza y contradice el criterio de no emplear servicios no oficiales.

Se optó por **enlazar, no consumir**: el mensaje de error del histórico abre directamente el cuadro «Tipo cambio de compra y de venta del dólar» del portal del BCCR, que es la pantalla equivalente a este módulo. Verificado en el banco 3.

**Mejora de experiencia derivada del diagnóstico.** Como el servicio falla de forma sostenida, cada intento consumía la solicitud inicial más los reintentos con espera progresiva: varios segundos de indicador de proceso para recibir siempre el mismo mensaje. El módulo ahora recuerda la caída durante 10 minutos y responde de inmediato, ofreciendo un botón «Comprobar de nuevo» que sí vuelve a consultar:

```
Primer intento   → 503 tras reintentos automáticos   (≈ 7 s)
Segundo intento  → aviso inmediato                   (23 ms medidos)
«Comprobar de nuevo» → vuelve a consultar la API realmente
```

Esto no oculta el fallo ni impide reintentar: en cuanto el Ministerio restablezca el servicio, el módulo funcionará sin ningún cambio en el código.

### Ministerio de Agricultura y Ganadería — registro de productores

Punto de partida: <https://mag.go.cr/servicios-y-tramites/consultaproductor/>

| Vía explorada | Resultado |
|---|---|
| `www.mag.go.cr/consulta/Registro-Persona-y-Establecimientos.xlsx` | **HTTP 404** — el enlace está roto en el propio sitio del MAG |
| Consulta pública `sistemasv2.mag.go.cr/SistemaDNEA/Productores/wf_ConsultaProductor.aspx` | Operativa, pero exige una cédula concreta; con búsqueda vacía responde «Sin datos para mostrar» |
| Consulta de establecimientos con CVO de SENASA (`sis.senasa.go.cr/establecimiento`) | Protegida con reCAPTCHA Enterprise; no procede eludirla |
| Portal nacional de datos abiertos | No publica el registro con identificaciones |

**Conclusión: no fue posible obtener un caso positivo.** Sin embargo, la exploración aportó dos resultados de valor, ambos incorporados a la aplicación:

**a) Regla del cero inicial — corrige documentación de terceros.** Listas comunitarias de APIs costarricenses afirman que «para la consulta de identificaciones físicas nacionales es necesario incluir el 0 como primer dígito». La verificación directa demuestra lo contrario, con pares comparados del mismo número:

```
/fe/ae?identificacion=012345678             → HTTP 400
/fe/ae?identificacion=112345678             → HTTP 404   (formato aceptado)
/fe/agropecuario?identificacion=0987654321  → HTTP 400
/fe/agropecuario?identificacion=1987654321  → HTTP 200   (formato aceptado)
/fe/pesca?identificacion=098765432          → HTTP 400
/fe/pesca?identificacion=198765432          → HTTP 200   (formato aceptado)
```

El cuerpo del 400 es explícito: `{"code":400,"status":"Bad Request, please review your request and try again"}`.

Impacto de la corrección: sin esta comprobación, un usuario que escribiera su cédula con el 0 delante habría recibido «no se encontró información», porque ese 400 llega sin cabeceras CORS y la sonda lo clasifica como registro inexistente. Ahora la aplicación lo detecta antes de enviar la solicitud y explica cómo corregirlo, ahorrando además una llamada inútil a la API.

**b) Nombres de campo del registro único.** La segunda tabla de la herramienta del MAG se titula «Listado de registros en MAG, SFE, SENASA que accede otras entidades (Hacienda, CCSS)» —exactamente la fuente que alimenta `/fe/agropecuario`— y expone estas columnas:

```
Fuente de Datos | Tipo Registro | Identificación | Tipo Identificación |
Nombre Productor | # Autorización | Estado | Fecha | Vence
```

La primera tabla añade: `Fecha Emisión`, `Fecha Vencimiento`, `Dirección Regional`, `Agencia Extensión`, `Tipo PYMPA`.

Estas etiquetas se incorporaron al diccionario `ETIQUETAS_REGISTRO`. El diccionario sólo se aplica a las claves que realmente lleguen en la respuesta: **no crea campos, no los muestra vacíos y no sugiere que existan.**

---

## 1. Banco de lógica pura — 60 casos

Ejercita validadores, normalizadores y clasificadores cargando el script de `index.html` en un contexto aislado. No consume la API.

```
$ node pruebas/pruebas-logica.js index.html

========================================================================
  ✓ identificacion   13/13
  ✓ exoneracion      9/9
  ✓ fechas           12/12
  ✓ cabys            7/7
  ✓ errores          8/8
  ✓ cabys-parse      5/5
  ✓ historico        7/7
  ✓ url              4/4
  ✓ formato          10/10
  ✓ catalogos        5/5
========================================================================
  TOTAL: 80 pruebas superadas, 0 fallidas
========================================================================
```

### Detalle por grupo

**Identificación (13 casos).** Cédula jurídica de 10 dígitos válida · normalización de guiones y espacios (`3-101-012386` → `3101012386`) · cédula física de 9 dígitos · DIMEX de 12 dígitos · rechazo de 8 dígitos · rechazo de 13 dígitos · rechazo de letras · rechazo de cadena vacía · rechazo de espacios en blanco · **rechazo de cédula física con 0 inicial** · **el mensaje del 0 inicial es explicativo** · **rechazo de cédula jurídica con 0 inicial** · **aceptación de la misma cédula sin el 0**.

**Autorización de exoneración (9 casos).** Conversión automática de 10 dígitos a `AL-XXXXXXXX-XX` · conversión desde minúsculas · admisión de separadores libres (`AL 00460853 20`) · admisión sin prefijo (`00460853-20`) · validación del formato correcto · rechazo de siete dígitos en el bloque central · **rechazo de prefijo distinto de AL** · rechazo de cadena vacía · rechazo de texto arbitrario.

**Rango de fechas (12 casos).** Fecha real del calendario · rechazo del 31 de febrero · rechazo del mes 13 · rechazo del formato `dd/mm/aaaa` · aceptación de `2024-02-29` (bisiesto) · rechazo de `2026-02-29` · rango válido de 10 días · rechazo de inicial posterior a final · rechazo de fecha futura · rechazo de rango superior a 366 días · aceptación de un solo día · rechazo de fechas faltantes.

**CABYS (7 casos).** Código de 13 dígitos válido · rechazo de 12 y de 14 dígitos · rechazo de letras · descripción de 3 caracteres válida · rechazo de 2 caracteres · normalización de espacios múltiples.

**Clasificación de errores incrustados en HTTP 200 (8 casos).** Detecta el cuerpo RFC 7231 de `/fe/agropecuario` · detecta `{code:404,status:"Information no available…"}` · detecta 400, 429 y 503 · **no** marca como error una respuesta válida de `/fe/ae` · **no** marca como error el tipo de cambio · ignora arreglos, como los que devuelve CABYS por código.

**Análisis de la respuesta CABYS (5 casos).** Arreglo directo · objeto `{total,cantidad,cabys}` · conservación del total informado · arreglo vacío · estructura no reconocida devuelve `null`.

**Normalizador del histórico (7 casos).** Arreglo de objetos planos → tabla · ordenación por la columna de fecha detectada · combinación de series `compra`/`venta` por fecha · objeto contenedor con un único arreglo · estructura irreconocible se muestra en crudo · arreglo vacío en crudo · `null` en crudo.

**Construcción de URL (4 casos).** Sin parámetros · con un parámetro · omisión de parámetros vacíos · codificación de espacios.

**Formato (10 casos).** Fecha ISO con hora sin desfase de zona (`2020-12-15T00:00:00` → «15 de diciembre de 2020») · fecha ISO simple · valor no fecha intacto · extracción de la parte `AAAA-MM-DD` · humanización de camelCase y snake_case · `hasValue` con cadena vacía, arreglo vacío, cero y `null`.

**Catálogos (5 casos).** Tipos de identificación 01 y 02 · rutas oficiales de `/fe/ae` y del histórico · origen `https://api.hacienda.go.cr`.

### Defectos encontrados y corregidos en esta fase

1. **Conversión excesiva del número de autorización.** `normalizarAutorizacion("XX-00460853-20")` producía `AL-00460853-20`: extraía los dígitos e imponía el prefijo `AL`, de modo que se habría consultado algo distinto de lo escrito. Corregido: la conversión automática sólo se aplica cuando la entrada no contiene un prefijo alfabético distinto de `AL`; en caso contrario el valor se devuelve intacto para que la validación lo rechace.
2. **Etiquetas generadas con mayúsculas intermedias.** `humanizeKey("fechaVencimiento")` devolvía «Fecha Vencimiento». Corregido a «Fecha vencimiento», acorde con la ortografía española.

---

## 2. Banco de integración con la API oficial — 16 casos

Ejercita la capa HTTP completa (`apiGet`: caché, deduplicación, limitador de ritmo, reintentos y clasificación de errores) contra los servicios reales.

```
$ node pruebas/pruebas-api.js index.html

PRUEBAS DE INTEGRACIÓN CONTRA api.hacienda.go.cr
====================================================================================
✓ M1 /fe/ae · contribuyente existente (4000042139)            343 ms
    nombre="INSTITUTO COSTARRICENSE DE ELECTRICIDAD", régimen="Régimen general", actividades=3
✓ M1 /fe/ae · contribuyente desinscrito con mensaje oficial   291 ms
    estado="Desinscrito oficio", mensaje presente=true
✓ M1 /fe/ae · identificación inexistente → not-found          266 ms   kind="not-found", HTTP 404
✓ M1 /fe/ae · parámetro ausente → bad-request               16781 ms   kind="bad-request", HTTP 400
✓ M1 /fe/ae · identificación con 0 inicial → bad-request      326 ms   kind="bad-request", HTTP 400
    regla verificada; la aplicación la bloquea antes de llegar a la red
✓ M2 /indicadores/tc/dolar · tipo de cambio vigente           286 ms
    fecha=2026-07-29, compra=449.94, venta=454.55
✓ M2 · caché: segunda llamada idéntica no genera tráfico        0 ms
    resuelta desde la caché en memoria
✓ M2 /indicadores/tc/dolar/historico · rango válido          1691 ms
    503 del servicio oficial, clasificado como "server" — comportamiento correcto
✓ M3 /fe/ex · autorización válida (AL-00460853-20)            371 ms
    doc=AL-00460853-20, exoneración=13%, institución="Ministerio de Hacienda"
✓ M3 /fe/ex · autorización inexistente → not-found           1192 ms   kind="not-found", HTTP 404
✓ M3 /fe/ex · formato rechazado por la API → bad-request      309 ms   kind="bad-request", HTTP 400
✓ M4 /fe/agropecuario · HTTP 200 con cuerpo 404 → not-found   180 ms
    error incrustado detectado pese al HTTP 200
✓ M5 /fe/pesca · HTTP 200 con cuerpo 404 → not-found          212 ms
    error incrustado detectado pese al HTTP 200
✓ M6 /fe/cabys · búsqueda por código (2132100000100)          203 ms
    descripción="Jugo de tomate concentrado", IVA=13%
✓ M6 /fe/cabys · búsqueda por descripción con top             235 ms   total=73, devueltos=3
✓ M6 /fe/cabys · código inexistente devuelve arreglo vacío    280 ms
    [] — la interfaz lo presenta como «Sin coincidencias»
✓ HTTP · dos llamadas simultáneas idénticas comparten una sola solicitud   177 ms
    una única solicitud de red (protege contra el doble clic)
====================================================================================
TOTAL: 17 superadas, 0 fallidas
```

### Observaciones

- **Códigos HTTP cubiertos con tráfico real:** 200, 400, 404 y 503.
- **El código 429 no se provocó deliberadamente.** Hacerlo habría bloqueado la dirección IP durante diez minutos y habría afectado a otros usuarios de la misma red, contraviniendo la política de uso del Ministerio. Su ruta de clasificación y reintento se validó en el banco de lógica pura (`detectarErrorIncrustado` y la tabla de mensajes), y en el navegador se comprobó que el mensaje asociado existe y es comprensible.
- **Caché:** la segunda llamada idéntica se resolvió en 0 ms sin tráfico de red.
- **Deduplicación:** dos llamadas simultáneas idénticas devolvieron la misma referencia de objeto, prueba de que compartieron una única solicitud.
- **Diferencia entre Node y navegador:** en Node no rige la política CORS, por lo que un 404 llega como `not-found`. En el navegador, ese mismo caso pasa por la sonda de conectividad; su comportamiento se verificó en el banco 3.

### Defecto encontrado y corregido en esta fase

**Espera excesiva por acumulación de tiempos de espera.** El caso «parámetro ausente» tardó 21,7 s: el primer intento agotó el tiempo de espera de 20 s y se reintentó. Con tres reintentos, el peor caso superaba el minuto frente al indicador de proceso. Corregido: el tiempo de espera se redujo a 15 s y los reintentos por tiempo agotado se limitaron a uno. El mismo caso pasó a 16,4 s, y los reintentos por 429 y 5xx conservan el máximo de tres.

---

## 3. Banco de navegador real (Google Chrome) — 46 casos

Ejecutado con Playwright sobre Chrome, con consultas reales a la API.

```
$ node pruebas/pruebas-navegador.js "…/index.html" "pruebas/capturas"

PRUEBAS EN NAVEGADOR REAL (Chrome)
====================================================================================
✓ Carga sin errores de JavaScript                    ninguna excepción registrada
✓ Título y encabezado presentes                      Verificador Hacienda CR
✓ Los 6 módulos están declarados como pestañas       Situación tributaria · Tipo de cambio ·
                                                     Exoneraciones · Agropecuario (MAG) ·
                                                     Pesca (INCOPESCA) · CABYS
✓ M1 · contribuyente existente muestra el nombre     INSTITUTO COSTARRICENSE DE ELECTRICIDAD
✓ M1 · tabla de actividades económicas renderizada   3 filas visibles
✓ M1 · mensaje de éxito visible                      «Consulta realizada»
✓ M1 · identificación no numérica se rechaza antes de consultar
✓ M1 · el campo queda marcado como inválido          aria-invalid="true"
✓ M1 · identificación con 0 inicial se bloquea antes de consultar
                                                     «El número no debe comenzar con cero…»
✓ M1 · registro inexistente → «Contribuyente no encontrado»   (404 sin CORS, vía sonda)
✓ M2 · tipo de cambio vigente muestra compra y venta ₡ 449,94 | ₡ 454,55 | ₡ 4,61
✓ M2 · se indica la fuente oficial                   Ministerio de Hacienda de Costa Rica
✓ M2 · fecha inicial posterior a la final se rechaza localmente
✓ M2 · el 503 del histórico se traduce a un mensaje comprensible
                                                     «Servicio histórico temporalmente no disponible»
✓ M2 · se enlaza el cuadro histórico exacto del BCCR
                                                     sdd.bccr.fi.cr/…/Contenedor/6?Cuadro=1
✓ M2 · una segunda consulta no repite la espera de reintentos
                                                     respondió en 23 ms (frente a ≈7 s)
✓ M2 · se ofrece un botón para volver a comprobar el servicio   «🔄 Comprobar de nuevo»
✓ M2 · «Comprobar de nuevo» reintenta realmente contra la API
✓ M3 · 10 dígitos se convierten al formato oficial   "0046085320" → AL-00460853-20
✓ M3 · autorización válida muestra los datos de la exoneración
✓ M3 · códigos CABYS cubiertos se listan en tabla    7211200000100
✓ M3 · formato incorrecto se rechaza sin consultar la API
✓ M4 · no registrado se comunica con prudencia       «No figura en el registro consultado»
✓ M4 · se ofrece el portal oficial del MAG para verificación cruzada
                                                     mag.go.cr/servicios-y-tramites/consultaproductor/
✓ M5 · registro pesquero no encontrado se comunica correctamente
✓ M6 · búsqueda por código devuelve el bien con su IVA
                                                     2132100000100 · Jugo de tomate concentrado · 13 %
✓ M6 · al elegir «por descripción» se oculta el campo de código
✓ M6 · al volver a «por código» se oculta el campo de descripción
✓ M6 · búsqueda por descripción devuelve resultados paginados   10 filas por página
✓ M6 · el filtro de la tabla reduce los resultados   1–10 de 16  →  1–2 de 2
✓ M6 · el encabezado expone el orden aplicado        aria-sort="ascending"
✓ M6 · el botón copia el código CABYS al portapapeles portapapeles = "0113100000000"
✓ M6 · exportación a CSV genera un archivo con contenido
                                                     cabys_busqueda_2026-07-29_1241.csv · 16 filas
✓ A11y · las flechas del teclado desplazan el foco entre pestañas
✓ A11y · la pestaña activa se marca con aria-selected
✓ A11y · el panel correspondiente queda visible y el resto oculto
✓ A11y · sólo una pestaña participa en el orden de tabulación   tabindex = -1
✓ A11y · existe enlace para saltar al contenido
✓ A11y · regiones aria-live para anunciar resultados  17 regiones declaradas
✓ UI · el conmutador aplica el modo oscuro            data-theme="dark"
✓ Privacidad · «Limpiar caché» vacía las consultas    5 → 0
✓ Privacidad · ninguna identificación consultada queda almacenada
                                                     localStorage = verificadorHaciendaCR.prefs
                                                     sessionStorage = 0 claves
✓ Errores · la falta de conexión produce un mensaje específico
✓ Errores · la barra de estado refleja la desconexión
✓ Móvil · la página no desborda horizontalmente (390 px)   scrollWidth − clientWidth = 0 px
✓ Móvil · la tabla se reorganiza en tarjetas apiladas       display de las celdas = flex
✓ Móvil · los botones cumplen el objetivo táctil mínimo     altura del botón = 44 px
====================================================================================
TOTAL: 47 superadas, 0 fallidas
```

### Defecto encontrado y corregido en esta fase

**El atributo `hidden` no ocultaba los campos del módulo CABYS.** Al elegir «por descripción», el campo «Código CABYS» seguía visible. Causa: la regla `.field{display:flex}` tiene mayor especificidad que la declaración `[hidden]{display:none}` de la hoja de estilos del navegador. Detectado en la captura de pantalla y confirmado midiendo el estilo calculado:

```
CAMPOS CABYS (modo descripción) — ANTES
  wrap-cabys-codigo   hidden=true   display=flex   visible=true   ← defecto
  wrap-cabys-q        hidden=false  display=flex   visible=true

CAMPOS CABYS (modo descripción) — DESPUÉS
  wrap-cabys-codigo   hidden=true   display=none   visible=false  ← corregido
  wrap-cabys-q        hidden=false  display=flex   visible=true
```

Corregido con la regla `[hidden]{ display:none !important; }`, y añadidos dos casos de regresión al banco de pruebas (los dos casos «M6 · al elegir / al volver…» del listado anterior).

### Falso positivo descartado

En la captura del modo oscuro pareció que la pestaña activa no se resaltaba. La medición del estilo calculado demostró que el comportamiento era correcto y que se trataba de una apreciación equivocada de la imagen:

```
PESTAÑAS en modo oscuro (CABYS seleccionada)
  tab-tributaria    aria-selected=false   bg=rgba(0,0,0,0)      color=rgb(174,186,218)
  tab-cabys         aria-selected=true    bg=rgb(123,163,240)   color=rgb(12,18,34)
```

No se realizó ningún cambio por este motivo.

---

## 4. Evidencia gráfica

Carpeta `pruebas/capturas/`, generada automáticamente durante la ejecución del banco 3:

| Archivo | Contenido |
|---|---|
| `01-tributaria-escritorio.png` | Módulo 1 con una consulta real resuelta (1280 × 900) |
| `02-tipo-cambio-escritorio.png` | Tipo de cambio vigente con compra, venta y fuente oficial |
| `03-exoneracion-escritorio.png` | Autorización `AL-00460853-20` con todos sus campos |
| `04-cabys-escritorio.png` | Catálogo CABYS con tabla, filtro, orden y paginación |
| `05-cabys-modo-oscuro.png` | La misma pantalla en modo oscuro |
| `06-cabys-movil.png` | Vista móvil 390 × 844, tabla apilada en tarjetas |
| `07-tributaria-movil.png` | Módulo 1 en móvil con resultado real |
| `10-sitio-publicado.png` | El **sitio publicado** en GitHub Pages, con consulta resuelta |
| `11-sitio-publicado-movil.png` | El sitio publicado en móvil (390 × 844) con consulta resuelta |
| `cabys-exportado.csv` | CSV descargado por la propia aplicación durante la prueba |

Extracto del CSV exportado, con separador `;`, BOM UTF-8 y comillas escapadas:

```csv
"Código CABYS";"Descripción del bien o servicio";"IVA";"Categoría principal";"Clasificación completa"
"0113100000000";"Arroz, para siembra (semillas)";"1";"Productos de la agricultura, silvicultura y pesca";"…"
"2312000000300";"Harina de arroz";"13";"Productos alimenticios, bebidas y tabaco; …";"…"
```

---

## 5. Prueba del proxy opcional

```
$ node proxy/server.js --port 8791
Proxy del Verificador Hacienda CR escuchando en http://localhost:8791

$ curl -s "http://localhost:8791/salud"
{"code":200,"status":"OK","proxy":"VerificadorHaciendaCR"}

$ curl -s -D - "http://localhost:8791/fe/ae?identificacion=4000042139" | head -6
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
X-Proxy-Upstream-Status: 200
Access-Control-Allow-Origin: *

$ curl -s -D - "http://localhost:8791/fe/ae?identificacion=3101002949" | head -6
HTTP/1.1 404 Not Found
Content-Type: application/json
Cache-Control: no-store
X-Proxy-Upstream-Status: 404
Access-Control-Allow-Origin: *          ← el 404 pasa a ser legible por el navegador

$ curl -s "http://localhost:8791/otra/cosa"
{"code":403,"status":"Ruta no permitida: /otra/cosa","proxy":true}
```

Se confirman las tres propiedades buscadas: el código y el cuerpo originales se conservan, se añaden las cabeceras CORS y la lista blanca impide que el proxy funcione como reenviador abierto.

---

## 6. Cobertura respecto a las pruebas mínimas solicitadas

| Prueba requerida | Estado | Dónde consta |
|---|---|---|
| Identificación válida e inválida | Cubierta | Banco 1 (9 casos) · Banco 3 |
| Contribuyente existente y no encontrado | Cubierta | Banco 2 · Banco 3 |
| Tipo de cambio actual | Cubierta | Banco 2 · Banco 3 · captura 02 |
| Rango histórico válido e inválido | Cubierta | Banco 1 (12 casos) · Banco 2 · Banco 3 |
| Autorización de exoneración válida y con formato incorrecto | Cubierta | Banco 1 · Banco 2 · Banco 3 · captura 03 |
| Productor agropecuario encontrado y no encontrado | **Cubierta** | Ambos casos verificados con datos reales del MAG. El caso «encontrado» reveló que la fecha de término se llama `fechaBajaMAG`: véase la sección 6 quinquies |
| Registro pesquero encontrado y no encontrado | **Cubierta** | Ambos casos verificados con datos reales de INCOPESCA. El caso «encontrado» reveló un defecto grave, ya corregido: véase la sección 6 quinquies |
| CABYS por código y por descripción | Cubierta | Banco 2 · Banco 3 · captura 04 |
| Error HTTP 400 | Cubierta | Banco 2 (dos casos, con tráfico real) |
| Error HTTP 404 | Cubierta | Banco 2 · Banco 3 (ruta CORS) |
| Error HTTP 429 | **Por diseño, no provocado** | Provocarlo habría bloqueado la IP durante 10 minutos y afectado a terceros. Ruta de clasificación validada en el Banco 1. |
| Errores HTTP 500 | Cubierta | El 503 real del histórico se ejercitó en los bancos 2 y 3 |
| Falta de conexión | Cubierta | Banco 3, con desconexión simulada por el navegador |
| Visualización en computadora y teléfono | Cubierta | Banco 3 · capturas 01–07 |
| Navegación mediante teclado | Cubierta | Banco 3 (6 casos de accesibilidad) |

---

## 6 bis. Banco del sitio publicado — 8 casos

Verifica la aplicación ya desplegada en <https://josancajimenez-debug.github.io/verificador-hacienda-cr/>, con consultas reales desde el origen público. Es la prueba decisiva del comportamiento CORS: abrir un archivo local no somete al navegador a las mismas reglas que un origen `https://` real.

```text
VERIFICACIÓN DEL SITIO PUBLICADO
========================================================================================
✓ El sitio responde por HTTPS                    HTTP 200
✓ Carga sin errores de JavaScript                ninguna excepción
✓ Logo de ACC Contadores visible                 imagen incrustada, cargada correctamente
✓ M1 · consulta real a api.hacienda.go.cr        HACIENDA SAN JERONIMO SOCIEDAD ANONIMA
✓ M2 · tipo de cambio desde el sitio público     ₡ 449,94 | ₡ 454,55 | ₡ 4,61
✓ M6 · CABYS desde el sitio público              2132100000100 · Jugo de tomate concentrado · 13 %
✓ M3 · 404 sin CORS bien clasificado             «Autorización no encontrada»
✓ Móvil · funciona y no desborda                 desbordamiento = 0 px, consulta resuelta
========================================================================================
TOTAL: 8 superadas, 0 fallidas
```

El caso M3 es el más relevante. La consola del navegador registra el bloqueo real:

```text
Access to fetch at "https://api.hacienda.go.cr/fe/ex?autorizacion=AL-01234567-89"
from origin "https://josancajimenez-debug.github.io" has been blocked by CORS
policy: No "Access-Control-Allow-Origin"
```

y aun así la interfaz muestra «Autorización no encontrada» en 1,8 segundos, gracias a la sonda de conectividad descrita en `README.md`, sección 4.

### Defecto encontrado y corregido al publicar

**Petición 404 a `/favicon.ico`.** Al verificar el sitio publicado, la consola registraba un error 404: el navegador pide el icono del sitio y un alojamiento estático no lo tiene. No afectaba al funcionamiento, pero ensuciaba la consola, que es justamente donde esta aplicación deja sus detalles técnicos de diagnóstico. Corregido incrustando el icono como data URI, tomado del visto bueno del logo de ACC Contadores.

Este defecto **no era detectable** en el banco 3, que abre la aplicación como archivo local: sólo apareció al probarla en su URL pública.

---

## 6 ter. Revisión completa de la aplicación

Realizada sobre el estado actual, que incluye el manual de usuario en ventana modal, los seis paneles «Significado, uso, aplicación e importancia» y el botón que abre el verificador oficial de comprobantes.

### Lo que se comprobó y salió correcto

| Comprobación | Resultado |
|---|---|
| Endpoints declarados en `RUTAS` | Sólo los seis oficiales; ninguno inventado |
| «Verificar comprobante» | No es un endpoint: es un enlace a `ovitribucr.hacienda.go.cr`, que responde 200 |
| `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval` | Ninguna aparición en código; sólo se mencionan en comentarios |
| Identificadores duplicados | Ninguno |
| Referencias `aria-labelledby`, `aria-describedby`, `aria-controls`, `for` | Todas resuelven |
| Anclas internas del manual | Las seis resuelven |
| Controles sin etiqueta accesible | Ninguno |
| Imágenes sin `alt` | Ninguna |
| `target="_blank"` sin `rel="noopener"` | Ninguno |
| Orden de encabezados | Sin saltos de nivel; un solo `<h1>` |
| Identificadores que el script usa pero no existen | Ninguno |
| Manual modal | `<dialog>` nativo, nombre accesible, el foco entra y se restaura, bloquea el fondo, cierra con Escape y con el botón |
| Paneles informativos | Seis, como `<details>`, plegables con teclado |
| Enlaces externos | Los cuatro responden 200 |
| Correspondencia entre cita y norma | Las siete correctas, incluida «Decreto 41779-H = Reglamento de la Ley 9635 del IVA» |
| Referencias al módulo de histórico retirado | Ninguna en manual, paneles ni interfaz |
| Adaptación con el manual abierto | Sin desbordamiento en 320, 390, 768 y 1280 px |
| Contenido del ZIP tras extraerlo | Los diez recursos presentes; la aplicación pasa los bancos de estructura y navegador desde la copia extraída |

### Defectos encontrados y corregidos

**1. Los ocho documentos legales enlazados devolvían 404 en el sitio publicado.** Los paneles informativos y las referencias enlazaban documentos de `BIBLIOGRAFÍA/`, pero esa carpeta estaba excluida en `.gitignore`: los enlaces funcionaban en local y fallaban en el sitio web sin señal alguna.

**Resolución definitiva:** se retiraron los enlaces. La bibliografía es el respaldo documental con el que se redactaron las explicaciones, no material que la aplicación deba distribuir. Las citas APA se conservan como texto —la atribución no cambia— y los enlaces de norma pasaron a `<cite>`, de modo que la referencia sigue identificada en pantalla sin apuntar a un archivo.

Efecto secundario valioso: `index.html` volvió a ser **verdaderamente autónomo**. Comprobado copiándolo solo a una carpeta vacía:

```text
carpeta con un único archivo (293 KB)  →  53 de 53 comprobaciones correctas
enlaces relativos de la página         →  0
```

Se añadió al banco del sitio publicado la comprobación que habría detectado el problema original: recorrer todos los enlaces relativos y exigir que ninguno quede roto.

**2. El manual describía mal la exportación a CSV.** Decía «descarga las filas visibles». En realidad exporta todas las filas que cumplen el filtro, en el orden elegido: con 16 registros y 10 por página, el archivo contiene 16 filas. Quien creyera lo contrario recorrería las páginas exportando varias veces. Corregido en el texto del manual.

**3. El README afirmaba que `index.html` es «autónomo» y el «único archivo necesario».** Dejó de ser cierto cuando la cabecera pasó a mostrar `ACC.CONTADORES.jpg` y los paneles a enlazar la bibliografía. Corregido, indicando qué recursos deben acompañar al HTML.

**4. El ZIP no reflejaba lo publicado.** Ahora se genera con `git archive HEAD`, de modo que **el ZIP y el sitio publicado contienen exactamente lo mismo**, y se verifica extrayéndolo y ejecutando los bancos sobre la copia.

### Hallazgo sobre el servicio oficial

**`/fe/ae` sin parámetros dejó de responder.** Por la mañana devolvía `400 Bad Request`; horas después, cuatro comprobaciones consecutivas con `curl` agotaron 25 segundos sin respuesta alguna:

```text
curl -m 25 "https://api.hacienda.go.cr/fe/ae"   → [000] 25,00 s   (×4)
```

No es un defecto de la aplicación y **la interfaz no puede llegar a ese caso**, porque la validación exige de 9 a 12 dígitos antes de enviar la solicitud. La prueba correspondiente se reformuló: en lugar de exigir un código HTTP concreto de un recurso inestable, verifica lo que sí está bajo control de la aplicación, que cualquiera de los desenlaces se convierta en un error **tipificado** y traducido, nunca en una excepción sin clasificar. El resultado observado fue `kind="timeout"` → «Tiempo de espera agotado».

---

## 6 quater. Revisión integral: depuración, rendimiento y accesibilidad

Revisión completa de la aplicación con dos bancos nuevos: un recorrido exhaustivo por la interfaz que no tolera ninguna excepción ni advertencia de consola, y un banco de calidad que mide memoria, seguridad y contraste.

### Defectos corregidos

**1. El botón «Copiar» lanzaba una excepción en cada pulsación.** El manejador es asíncrono y leía `event.currentTarget` **después** de esperar al portapapeles. Esa propiedad sólo es válida mientras el evento se está despachando: en cuanto el manejador cede el control en un `await`, pasa a `null`.

```text
TypeError: Cannot read properties of null (reading 'textContent')
    at HTMLButtonElement.click (index.html:2334)
```

El código copiaba correctamente y el aviso flotante aparecía, de modo que el fallo pasaba inadvertido: lo único que no funcionaba era la confirmación «✔ Copiado» del propio botón. Corregido tomando el elemento del cierre en lugar del evento. Se añade además la cancelación del temporizador anterior, porque varias pulsaciones seguidas dejaban el rótulo congelado.

**2. Contraste por debajo del mínimo WCAG AA en el tema claro.** La variable `--text-faint` valía `#6b7896`:

| Elemento | Fondo | Antes | Ahora |
|---|---|---:|---:|
| Ruta del endpoint | `--bg-inset` | **3,80:1** | 4,83:1 |
| Texto de ayuda bajo los campos | `--bg-sunken` | **4,16:1** | 5,28:1 |
| Etiquetas de campo y barra de estado | `--bg-elev` | **4,42:1** | 5,61:1 |

Se oscurece a `#5a6883`, que deja el peor caso en 4,83:1. Afectaba a los textos de ayuda, las etiquetas de resultado, la barra de estado y la ruta del endpoint.

**3. Un fallo al guardar en caché podía tumbar una consulta ya resuelta.** La caché es una optimización: ahora el guardado va protegido y un problema allí deja una traza sin afectar al resultado que la persona usuaria está esperando.

### Memoria y rendimiento

| Aspecto | Antes | Ahora |
|---|---|---|
| Tamaño de la caché | Sin tope | Máximo 100 entradas, descartando las más antiguas |
| Entradas vencidas | Sólo se borraban al reconsultar la misma URL | Barrido periódico que se detiene solo al quedar vacía |
| Temporizadores del limitador | Uno por cada solicitud en espera | Uno solo (comprobado con 25 tareas encoladas) |

La purga periódica importa por privacidad, no sólo por memoria: una consulta que nadie repite se quedaba en memoria indefinidamente con el número de identificación dentro, pese a que la aplicación promete una caché temporal.

### Falsos positivos descartados

Dos hallazgos iniciales resultaron ser errores de medición de las propias pruebas, no defectos de la aplicación:

- **BOM del CSV.** `Blob.text()` descarta la marca de orden de bytes al decodificar UTF-8. Leyendo los bytes en crudo aparece: `EF BB BF`. La prueba se corrigió para leer el búfer.
- **Botón principal en tema oscuro, 1,70:1.** El color se leyó mientras la transición CSS aún interpolaba, de modo que se midió el fondo del tema anterior contra el texto del nuevo. Con las transiciones desactivadas el valor real es **7,41:1**. La prueba ahora inyecta `transition:none` antes de medir.

También se descartó una tanda de «símbolos sin usar» del análisis estático: el analizador trataba `//` dentro de cadenas como comentario y borraba código. Comprobado directamente sobre el archivo, las once funciones y todas las claves de configuración se utilizan.

### Recorrido exhaustivo: 46 pasos sin una sola incidencia

```text
· Las seis pestañas y sus seis paneles informativos, abriendo y cerrando cada guía
· Cuatro formularios × (envío vacío + 3 a 5 valores inválidos + valor válido)
· Limpiar y Nueva consulta en cada módulo
· CABYS: código válido, código inexistente, descripción, filtro,
  orden por las cinco columnas en ambos sentidos, paginación completa,
  copiado, exportación CSV y descripción demasiado corta
· Tipo de cambio: consulta y limpieza
· Doble clic sobre Consultar
· Manual: apertura, los seis enlaces del índice y cierre con Escape
· Tema: ciclo completo de los tres modos
· Acceso admin: contraseña incorrecta rechazada y contraseña correcta aceptada
· Configuración: guardar, proxy inválido, proxy inseguro y restablecer
· Limpiar caché
· Pérdida de conexión y recuperación
· 60 pulsaciones de Tab por toda la interfaz
```

Resultado: **ninguna excepción, ningún error ni advertencia de consola, ningún paso fallido.**

---

## 6 quinquies. Acceso administrativo a la configuración avanzada

La configuración avanzada dejó de estar a la vista de cualquier visitante: ahora se
desbloquea con una contraseña que el navegador comprueba mediante **PBKDF2-SHA-256 con
210 000 iteraciones**. En el archivo sólo viajan la sal y el hash; la contraseña no se
guarda nunca en texto legible, y la comparación del resultado se hace en tiempo constante.

### Lo que se comprobó

```text
· La configuración no es visible al cargar la página
· El botón arranca en estado bloqueado y así lo declara (data-admin="locked")
· El acceso se pide en un <dialog> modal con nombre accesible
· El campo usa type="password", de modo que no se muestra en pantalla
· Escape cierra el diálogo sin conceder acceso
· Una contraseña incorrecta produce aviso y NO revela la configuración
· La contraseña correcta la muestra y el botón pasa a «Cerrar admin»
· La contraseña no aparece en localStorage, sessionStorage ni cookies
· El desbloqueo sobrevive a una recarga de la misma pestaña
· «Cerrar admin» vuelve a ocultarla y borra la marca de sesión
```

Doce casos en el banco 4 y un paso más en el recorrido: **13 comprobaciones nuevas, todas
correctas**. El banco 5 se reforzó además para verificar la privacidad *en el peor caso*:
con la sesión administrativa abierta, `sessionStorage` contiene únicamente la marca
`verificadorHaciendaCR.adminUnlocked=1`, sin ninguna identificación consultada.

### Alcance real de este control — declarado, no supuesto

Conviene no exagerar lo que aporta. La aplicación es un archivo estático que se descarga
completo en el navegador de cada visitante, de modo que **este control evita el manejo
accidental, no el acceso deliberado**: quien edite el JavaScript en su propio navegador
puede saltárselo. Dos observaciones honestas al respecto:

1. **La contraseña de reparto es pública.** Figura en el `README.md`, que se publica en el
   mismo repositorio abierto que la aplicación. Mientras no se cambie, cualquiera que lea
   la documentación puede abrir el panel. El README lo advierte de forma expresa y explica
   cómo generar una sal y un hash nuevos.
2. **Detrás del portón no hay ningún secreto.** Los dos ajustes del panel —duración de la
   caché y dirección de un proxy propio— se guardan en el `localStorage` de cada visitante
   y sólo afectan a su propia sesión: no hay configuración compartida que un tercero pueda
   alterar para los demás. Por eso la exposición de la contraseña es un defecto de
   coherencia, no una vía de compromiso.

Para proteger algo que sí fuera sensible, el área administrativa tendría que trasladarse a
un backend autenticado; con una arquitectura estática no hay forma de lograrlo.

---

## 7. Reproducción de las pruebas

```bash
# Banco 1 — no consume la API
node pruebas/pruebas-logica.js index.html

# Banco 2 — realiza unas 17 llamadas reales, muy por debajo de los límites oficiales
node pruebas/pruebas-api.js index.html

# Banco 3 — requiere Playwright y Google Chrome instalado
npm install playwright
node pruebas/pruebas-navegador.js "RUTA/ABSOLUTA/index.html" "pruebas/capturas"

# Todos los bancos locales de una vez
npm test

# O uno a uno:
npm run test:logica         # validadores y normalizadores
npm run test:api            # integración contra la API real
npm run test:estructura     # DOM, ARIA, anidamiento
npm run test:comportamiento # manual modal, acceso admin, paneles, teclado
npm run test:calidad        # memoria, seguridad y contraste
npm run test:recorrido      # 46 pasos, sin tolerar errores de consola
npm run test:navegador      # interfaz completa y capturas
npm run test:sitio          # contra la URL pública ya desplegada
node pruebas/pruebas-estructura.js index.html
node pruebas/pruebas-comportamiento.js index.html

# Banco 6 — contra el sitio ya publicado
node pruebas/pruebas-sitio-publicado.js "https://josancajimenez-debug.github.io/verificador-hacienda-cr/" "pruebas/capturas"

# Todos los bancos locales de una vez
npm test

# Proxy opcional
node proxy/server.js --port 8787
curl "http://localhost:8787/salud"
```

Los bancos 2 y 3 consultan servicios oficiales. Ejecútelos con moderación: cada ejecución completa realiza aproximadamente 30 solicitudes, cifra muy inferior a los umbrales publicados, pero conviene no repetirlas en bucle.
