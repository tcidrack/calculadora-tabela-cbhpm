/**
 * Fecha o build offline: embute o favicon e deixa um único arquivo em dist-offline.
 *
 * O vite-plugin-singlefile já inlina JS, CSS e a fonte de ícones, mas o favicon vem
 * de public/ como arquivo separado e com caminho absoluto — que não resolve em
 * file://. Aqui ele vira data URI e o resto da pasta é limpo.
 *
 * Roda automaticamente depois de `vite build --mode offline`.
 */

import { readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SAIDA = join(RAIZ, "dist-offline");
const FINAL = "CBHPM-offline.html";

const favicon = readFileSync(join(RAIZ, "public", "favicon-maida.png")).toString("base64");

const origem = join(SAIDA, "index.html");
let html = readFileSync(origem, "utf-8");

// o singlefile reescreve o caminho para "./favicon-maida.png"; casar o "./" opcional
// evita deixar um ponto solto grudado no data URI
html = html.replace(/\.?\/favicon-maida\.png/g, `data:image/png;base64,${favicon}`);

const problemas = [
  [/favicon-maida\.png/, "favicon não embutido"],
  [/(src|href)="\.?\/assets/, "asset externo em /assets"],
  [/(src|href)="[^"]*\.(js|css|woff2?|svg|png)"/, "arquivo externo referenciado"],
  [/href="\.data:/, "data URI malformado"],
].filter(([re]) => re.test(html));

if (problemas.length) {
  throw new Error("HTML offline não está autocontido: " + problemas.map((p) => p[1]).join("; "));
}

writeFileSync(origem, html);
renameSync(origem, join(SAIDA, FINAL));

// tudo o que não for o HTML final já está embutido nele
for (const nome of readdirSync(SAIDA)) {
  if (nome !== FINAL) rmSync(join(SAIDA, nome), { recursive: true, force: true });
}

const kb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1);
console.log(`dist-offline/${FINAL} — ${kb} MB, autocontido`);
