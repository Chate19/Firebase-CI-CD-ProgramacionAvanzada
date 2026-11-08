# Reflexión · CI/CD con Firebase Hosting

- **Repo:** <https://github.com/Chate19/Firebase-CI-CD-ProgramacionAvanzada>
- **Project ID:** `practica-cicd-chate`
- **Producción:** <https://practica-cicd-chate.web.app>
- **Secreto usado:** `FIREBASE_SERVICE_ACCOUNT_PRACTICA_CICD_CHATE`

## B1 · Medición inicial (antes de tocar `firebase.json`)

Salida de `node scripts/check-headers.mjs https://practica-cicd-chate.web.app` sobre el
estado base, ya desplegado pero **sin headers propios**:

```text
▶ HTML: https://practica-cicd-chate.web.app/
  status 200
  ✘ content-security-policy (falta)
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✘ x-content-type-options (falta)
  ✘ x-frame-options (falta)
  ✘ referrer-policy (falta)
  ✘ permissions-policy (falta)
  · cache-control: max-age=3600

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✘ cache-control: max-age=3600

❌ 6 control(es) pendiente(s).
```

El único header de seguridad presente era el HSTS que agrega Firebase Hosting por su
cuenta. Además, HTML y assets compartían el mismo `Cache-Control: max-age=3600`, así que
un deploy o un rollback podía tardar hasta una hora en verse.

Medición con <https://securityheaders.com> en ese estado inicial: **D**. Para reconstruirla
se desplegó el commit base (`49c76cd`, con `"headers": []`) en un canal temporal y se
escaneó esa URL; el resultado fue el mismo que el de producción antes del hardening: solo
HSTS presente, sin CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` ni
`Permissions-Policy`. El canal temporal se borró después de medir.

## B5 · Medición final (después del hardening)

Salida de `node scripts/check-headers.mjs https://practica-cicd-chate.web.app` sobre el
deploy final (merge del PR #3, footer `6d607a9`):

```text
▶ HTML: https://practica-cicd-chate.web.app/
  status 200
  ✔ content-security-policy: default-src 'self'; script-src 'self' 'sha256-9Pt889F4R3qOnpWeW94nSMdM2O7pizigMXGvx7AupqA=' 'sha256-OBTN3RiyCV…
  ✔ strict-transport-security: max-age=31556926; includeSubDomains; preload
  ✔ x-content-type-options: nosniff
  ✔ x-frame-options: DENY
  ✔ referrer-policy: strict-origin-when-cross-origin
  ✔ permissions-policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(),…
  · cache-control: public, max-age=0, must-revalidate

▶ Asset estático: /_next/static/chunks/1x6obpmlu1_c2.js
  ✔ cache-control: public, max-age=31536000, immutable

✅ Todos los controles pasaron.
```

Medición final con <https://securityheaders.com>: **A+** (reporte del 08 Nov 2026 22:45
UTC), con los seis headers evaluados presentes.

Nota sobre HSTS: `firebase.template.json` declara `max-age=63072000` (2 años), pero
Firebase Hosting administra ese header por su cuenta y sirve
`max-age=31556926; includeSubDomains; preload` (~1 año), aun cuando la configuración
declare otro valor. El header está presente y cumple el objetivo; el valor efectivo es el
de la plataforma.

## Cómo se resolvió la CSP (sin `'unsafe-inline'`)

Next.js en export estático inyecta scripts inline: el bootstrap de Turbopack
(`<script id="_R_">`) y el payload RSC (`self.__next_f.push(...)`). Una CSP con solo
`script-src 'self'` los bloquea y la app deja de hidratar: el HTML se ve, pero el filtro de
`/cursos` no responde.

Como no hay servidor, no se puede usar un nonce por request. La solución implementada:

1. `firebase.template.json` es la fuente de verdad de los headers y tiene el placeholder
   `__CSP_SCRIPT_HASHES__` en `script-src`.
2. `scripts/generate-csp.mjs` recorre **todos** los HTML de `out/`, extrae el contenido
   exacto de cada `<script>` sin `src`, calcula su SHA-256 en base64 y reemplaza el
   placeholder por la lista `'sha256-...'`.
3. `package.json` define `"postbuild": "node scripts/generate-csp.mjs"`, así que
   `npm run build` siempre regenera `firebase.json` con los hashes del build que se va a
   desplegar. El pipeline no necesita un paso extra: el mismo `npm run build` de los
   workflows deja la config lista.

Costo de seguridad/operativo: si el HTML cambia y los hashes no se recalculan, la CSP
rompe la app. Por eso el cálculo está atado al build y no se commitea a mano. La lista de
hashes incluye las 4 páginas exportadas (`index`, `cursos`, `404`, `_not-found`).

También hubo que permitir la imagen de portada por **origen exacto**: `picsum.photos`
responde con un `302` a `fastly.picsum.photos`, y el navegador valida el origen final.
Por eso `img-src` incluye ambos orígenes y no un comodín.

## Respuestas

### 1. ¿Por qué el preview tiene vencimiento? ¿Qué riesgos tendría un preview que no vence nunca?

Porque un preview channel es un entorno efímero: existe para revisar un PR y debe
desaparecer cuando el PR se cierra o queda obsoleto. Sin vencimiento, los canales se
acumulan, consumen cuota/almacenamiento y quedan URLs públicas con versiones viejas,
borradores o contenido que ya no debería estar accesible. También se vuelve más difícil
saber cuál es el preview vigente y aumenta la superficie de ataque (más hosts y versiones
sin mantenimiento). Un `expires: 3d` fuerza la limpieza y reduce ese riesgo.

### 2. ¿Qué diferencia hay entre desplegar y liberar? ¿Dónde aparece cada concepto en este flujo?

**Desplegar** es subir/crear una versión en Hosting: el artefacto queda almacenado y
asociado a un canal, pero no necesariamente lo ve el público. **Liberar** (release) es
hacer que esa versión sea la que sirve el canal en vivo.

En este flujo, el workflow de PR **despliega** a un preview channel (`channelId`
autogenerado, `expires: 3d`). El merge a `main` **libera** al canal `live`
(`channelId: live`). La promoción con `firebase hosting:clone <PROJECT>:<CANAL>
<PROJECT>:live` es un caso intermedio: reutiliza una versión ya desplegada y la libera sin
recompilar.

### 3. ¿Por qué la clave de la service account va en un secreto y no en el repo? ¿Qué podría hacer alguien que la obtenga? ¿Cómo limitarías el daño?

Porque una clave JSON de service account es una credencial de larga duración: si se
commitea, queda en el historial de Git y en cualquier clon, aunque después se borre. En un
repo público es peor todavía, porque queda indexada.

Quien la obtenga puede autenticarse como esa identidad y, según sus roles, desplegar
contenido malicioso en Hosting, modificar canales, leer/escribir recursos de Firebase o
consumir cuota. Para limitar el daño: usar una service account dedicada con el rol mínimo
(por ejemplo, *Firebase Hosting Admin* solo sobre ese proyecto), no reutilizar la cuenta
de owner, rotar la clave si se filtró, exigir aprobación manual con un GitHub Environment
`production`, restringir qué ramas pueden usar el secreto, revisar los logs de auditoría y,
a futuro, migrar a federación de identidad (OIDC) para no depender de claves estáticas.

### 4. La CSP rompió la app: ¿por qué? ¿Qué opciones evaluaste y qué costo de seguridad tiene cada una?

Porque Next.js en export estático inserta scripts inline para el bootstrap de Turbopack y
para el payload RSC. `script-src 'self'` no los autoriza, así que el navegador no los
ejecuta y React no hidrata; el HTML inicial se ve, pero el filtro no reacciona.

Opciones evaluadas:

- **`'unsafe-inline'`:** funciona y es simple, pero permite cualquier script inline, que es
  justamente el vector típico de XSS. Se descartó para producción.
- **Nonces por request:** es la opción ideal con SSR, pero en export estático no hay
  servidor que genere un nonce distinto por respuesta. No aplica.
- **Hashes SHA-256:** se calcula el hash de cada script inline en el build y se listan en
  `script-src`. Es la opción implementada. Costo: hay que regenerar los hashes en cada
  build; si el HTML cambia y la lista queda vieja, la app se rompe.
- **`'strict-dynamic'`:** requiere un nonce o hash en un script “loader”; no resuelve el
  problema por sí solo en este esquema.
- **Externalizar los scripts inline:** implicaría reescribir la salida de Next o usar un
  servidor; no es razonable para esta práctica.

También hubo que ajustar `img-src`: la portada viene de `picsum.photos`, que redirige a
`fastly.picsum.photos`. Permitir solo el primer origen rompía la imagen.

### 5. Para cada header de B2, ¿qué ataque mitiga?

- **Strict-Transport-Security:** mitiga *SSL stripping* y downgrades a HTTP en visitas
  posteriores. Se configuró `max-age=63072000` (2 años) + `includeSubDomains` + `preload`;
  Firebase sirve efectivamente `max-age=31556926` (~1 año) con las mismas directivas, y
  eso fuerza HTTPS en todo el sitio y subdominios.
- **X-Content-Type-Options: nosniff:** evita que el navegador “adivine” el tipo de un
  archivo; mitiga confusión de MIME y XSS a través de archivos que el navegador interpreta
  como HTML/JS aunque el servidor declare otro tipo.
- **X-Frame-Options: DENY:** mitiga *clickjacking* / UI redressing, impidiendo que el sitio
  se embeba en un iframe. Se complementa con `frame-ancestors 'none'` en la CSP.
- **Referrer-Policy: strict-origin-when-cross-origin:** limita cuánto de la URL se envía a
  otros orígenes; evita filtrar paths, parámetros o tokens en el `Referer`.
- **Permissions-Policy:** desactiva APIs sensibles del navegador (cámara, micrófono,
  geolocalización, pago, USB, sensores) salvo `fullscreen=(self)`. Mitiga abuso de
  permisos y reduce la superficie si se inyecta código.
- **Content-Security-Policy:** mitiga XSS y ejecución de recursos no autorizados, además de
  `frame-ancestors 'none'` (clickjacking) y `base-uri 'self'` (secuestro del `<base>`).
  Se sumaron `Cross-Origin-Opener-Policy: same-origin` y
  `Cross-Origin-Resource-Policy: same-origin` para aislar el contexto de navegación y
  evitar que otros orígenes embeban recursos del sitio.

### 6. ¿Por qué los assets de `/_next/static/` pueden cachearse un año y el HTML no?

Porque los nombres de los assets incluyen un hash de contenido
(`/_next/static/chunks/<hash>.js`). Si el contenido cambia, cambia la URL, así que es
seguro declararlos `immutable` por un año: el navegador nunca reutiliza un archivo viejo
para una URL nueva.

El HTML no está versionado y es el que referencia esos assets. Si se cachea sin
revalidar, un deploy o un rollback pueden tardar en verse y el usuario puede quedar con un
HTML que apunta a chunks que ya no existen. Por eso el HTML va con
`public, max-age=0, must-revalidate`: se revalida en cada visita y el cambio se ve
inmediatamente.

### 7. Si la app necesitara SSR, ¿qué cambiaría en la arquitectura, en la CSP y en el costo?

Arquitectura: ya no alcanza con export estático y Firebase Hosting solo. Habría que usar
Firebase App Hosting (Cloud Run) o un servidor Node/Next, con un runtime que renderice por
request. Cambian el pipeline (build + deploy del servidor, no solo archivos), el manejo de
secretos y la observabilidad.

CSP: al haber servidor se puede generar un **nonce por request** y usar
`script-src 'nonce-...' 'strict-dynamic'`, que es más robusto que los hashes estáticos y no
requiere recalcular todo el HTML en cada build. También aparecen necesidades de
`connect-src` para las llamadas del servidor y de `form-action`/`frame-src` según el caso.

Costo: el plan Spark no alcanza; App Hosting/Cloud Run requiere Blaze (facturación), con
costo por CPU/memoria, instancias mínimas, cold starts y escalado. Además hay que sumar
monitoreo, logs y backups. Para este catálogo estático, ese costo no se justifica.

## Ciclo completo, rollback y promoción (A6)

Versiones involucradas:

- `ee2501f` — merge del PR #1 (primer deploy hardened).
- `bea48b3` — merge del PR #2 (versión viva sobre la que se practicó el rollback).
- `2385bcf` — último commit del PR #2 (versión del preview channel).
- `902c821` — commit de `feat/titulo` (título nuevo).
- `6d607a9` — merge del PR #3 (versión viva al cerrar la práctica).

1. **Ciclo con cambio visible (pasos 1–3):** se creó la rama `feat/titulo`, se cambió el
   `<h1>` de `app/page.tsx` a “Catálogo de Cursos · Edición 2026” y se abrió el
   [PR #3](https://github.com/Chate19/Firebase-CI-CD-ProgramacionAvanzada/pull/3). El
   preview mostró el título nuevo con footer `902c821` y rama `feat/titulo`, mientras
   producción seguía con el título anterior y `bea48b3`. Después del merge, producción
   mostró el título nuevo y el footer `6d607a9`.
2. **Rollback (paso 4):** sobre la versión `bea48b3` se creó un release en `live`
   apuntando a la versión `122ae542b04a8f09` (footer `ee2501f`). Verificado: el footer
   pasó de `bea48b3` a `ee2501f`, y los headers, el filtro y la imagen siguieron
   funcionando.
3. **Restauración:** se creó un release en `live` apuntando a la versión
   `6810ec43970cc9b2` (footer `bea48b3`). Verificado.
4. **Bonus promoción (paso 5):** `npx firebase hosting:clone
   practica-cicd-chate:pr2-fix-verify-retries practica-cicd-chate:live` promovió el
   preview a producción sin recompilar. El footer mostró `2385bcf`; después se restauró
   `bea48b3` y más tarde el merge del PR #3 liberó `6d607a9`.

Después del rollback, `main` sigue teniendo el código nuevo. El próximo merge/push a
`main` vuelve a desplegar el código de `main`: el rollback no “arregla” Git. En un equipo
real el rollback es una mitigación inmediata; después se hace un revert del commit que
rompió (o un fix-forward), se deja que el pipeline libere de nuevo y se documenta el
incidente. El rollback de la consola y el `hosting:clone` crean un release nuevo sobre
`live`; no reescriben la historia ni el estado de `main`.

## Entregables

1. Repo: <https://github.com/Chate19/Firebase-CI-CD-ProgramacionAvanzada>
2. Producción: <https://practica-cicd-chate.web.app>
3. PRs mergeados con comentario del bot:
   - <https://github.com/Chate19/Firebase-CI-CD-ProgramacionAvanzada/pull/1> (pipeline + hardening)
   - <https://github.com/Chate19/Firebase-CI-CD-ProgramacionAvanzada/pull/2> (reintentos del gate + B5)
   - <https://github.com/Chate19/Firebase-CI-CD-ProgramacionAvanzada/pull/3> (ciclo A6: cambio de título)
4. Salidas de `check-headers.mjs`: B1 y B5 en este archivo, más la comparación de
   securityheaders.com (**D** inicial → **A+** final).
5. Reflexión: este archivo.
6. Versión viva al cerrar: footer `6d607a9` en <https://practica-cicd-chate.web.app>.
