#!/usr/bin/env node
/**
 * Genera `firebase.json` a partir de `firebase.template.json`.
 *
 * La CSP estricta no puede usar `'unsafe-inline'` en `script-src`: Next.js en
 * export estático inyecta scripts inline (bootstrap de Turbopack y payload RSC)
 * cuyo contenido cambia en cada build. Por eso, después de `next build`,
 * calculamos el hash SHA-256 de cada script inline de TODOS los HTML de `out/`
 * y lo inyectamos en la directiva `script-src`.
 *
 * Uso:
 *   npm run build          # next build + postbuild (este script)
 *   node scripts/generate-csp.mjs
 *
 * El archivo `firebase.json` es generado: para cambiar headers, editá
 * `firebase.template.json`.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "out");
const templatePath = path.join(root, "firebase.template.json");
const targetPath = path.join(root, "firebase.json");
const PLACEHOLDER = "__CSP_SCRIPT_HASHES__";

if (!existsSync(outDir)) {
  console.error(
    "✘ No existe out/. Ejecutá `npm run build` antes de generar firebase.json.",
  );
  process.exit(1);
}

if (!existsSync(templatePath)) {
  console.error("✘ No existe firebase.template.json.");
  process.exit(1);
}

const htmlFiles = readdirSync(outDir, { recursive: true }).filter(
  (file) => typeof file === "string" && file.endsWith(".html"),
);

if (htmlFiles.length === 0) {
  console.error("✘ No se encontraron archivos .html en out/.");
  process.exit(1);
}

const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const hashes = new Set();

for (const relative of htmlFiles) {
  const html = readFileSync(path.join(outDir, relative), "utf8");
  let match;
  while ((match = scriptRe.exec(html)) !== null) {
    const attrs = match[1];
    const body = match[2];

    // Los scripts con src se permiten con 'self'; solo hasheamos los inline.
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (body.length === 0) continue;

    const digest = createHash("sha256").update(body, "utf8").digest("base64");
    hashes.add(`'sha256-${digest}'`);
  }
}

const template = readFileSync(templatePath, "utf8");
if (!template.includes(PLACEHOLDER)) {
  console.error(`✘ firebase.template.json no contiene ${PLACEHOLDER}.`);
  process.exit(1);
}

const hashList = [...hashes].sort().join(" ");
const generated = template.replace(PLACEHOLDER, hashList);

// Validación barata: el resultado debe seguir siendo JSON válido.
JSON.parse(generated);

writeFileSync(targetPath, generated);

console.log(
  `✔ firebase.json generado: ${hashes.size} hash(es) CSP de scripts inline ` +
    `en ${htmlFiles.length} HTML(s).`,
);
