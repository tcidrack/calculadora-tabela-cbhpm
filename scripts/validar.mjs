/**
 * Confere o motor de cálculo JS contra os valores já calculados pelo Excel.
 *
 * Lê as colunas O:R de BD_CBHPM (PORTE_R$, UCO_R$, FILME_R$, TOTAL_R$) direto do
 * .xlsx e compara com a saída de `calcular()`, usando o ano da própria edição como
 * cotação — que é o que a planilha faz naquelas colunas.
 *
 * Uso:  node scripts/validar.mjs
 */

import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { calcular, VALOR_FILME_M2 } from "../src/lib/cbhpm.js";

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const XLSX = join(dirname(RAIZ), "CALCULO_CBHPM__V05022022-9q6ii2.xlsx");
const TOLERANCIA = 0.01;

// Extrair as colunas calculadas exige ler o XML do xlsx; Python já faz isso no
// extrair.py, então reaproveitamos o mesmo caminho em vez de portar o parser.
const PY = `
import html, json, re, sys, zipfile
import xml.etree.ElementTree as ET
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
z = zipfile.ZipFile(sys.argv[1])
xml = z.read("xl/sharedStrings.xml").decode("utf-8")
strings = ["".join(re.findall(r"<t[^>]*>(.*?)</t>", m.group(1), re.S))
           for m in re.finditer(r"<si>(.*?)</si>", xml, re.S)]
strings = [html.unescape(s) for s in strings]
def idx(ref):
    n = 0
    for c in "".join(ch for ch in ref if ch.isalpha()):
        n = n * 26 + ord(c) - 64
    return n - 1
out = []
with z.open("xl/worksheets/sheet3.xml") as f:
    primeira = True
    for _, el in ET.iterparse(f, events=("end",)):
        if el.tag != NS + "row":
            continue
        if primeira:
            primeira = False; el.clear(); continue
        c18 = [""] * 18
        for c in el.findall(NS + "c"):
            i = idx(c.get("r"))
            if i >= 18: continue
            t = c.get("t", "n"); v = c.find(NS + "v")
            val = v.text if v is not None and v.text else ""
            if t == "s" and val: val = strings[int(val)]
            c18[i] = val
        el.clear()
        def f(v):
            # IFERROR das colunas O:R devolve "-" quando o porte nao existe na edicao
            try:
                return float(v)
            except (TypeError, ValueError):
                return None
        total = f(c18[17])
        if total is None:
            continue
        out.append([c18[0], c18[1], f(c18[14]), f(c18[15]), f(c18[16]), total,
                    c18[6].strip() not in ("", "-")])
json.dump(out, sys.stdout)
`;

console.log("lendo colunas calculadas do .xlsx...");
const bruto = execFileSync("python", ["-c", PY, XLSX], {
  maxBuffer: 512 * 1024 * 1024,
  encoding: "utf-8",
});
const linhas = JSON.parse(bruto);
console.log(`linhas com TOTAL_R$ numérico: ${linhas.length.toLocaleString("pt-BR")}`);

/**
 * Divergências deliberadas: linhas em que a planilha grava PORTE2 sujo ('  1A',
 * com espaços à esquerda), o MATCH do Excel devolve #N/A e o honorário sai como
 * "-". O extrator normaliza o valor, então aqui o honorário é calculado de fato.
 * O motor está certo e a planilha, errada — mas registramos para não mascarar
 * uma regressão futura.
 */
const ESPERADAS = new Set(["2010/40503240"]);

let ok = 0;
let semRegistro = 0;
let intencionais = 0;
const divergencias = [];

for (const [edicao, codigo, porteXls, ucoXls, filmeXls, totalXls, temPorte] of linhas) {
  const r = calcular({ codigo, edicao, anoCotacao: edicao, valorFilmeM2: VALOR_FILME_M2 });
  if (!r) {
    semRegistro++;
    continue;
  }

  // A coluna PORTE_R$ do banco usa duas fórmulas diferentes: para procedimentos com
  // PORTE2 ela traz o honorário do porte; para os de anestesia (sem PORTE2, só com
  // Portes Anestésico) ela traz o valor do anestesista. O painel Espelho separa os
  // dois em linhas distintas — D9 (HONOR.) e D14 (ANESTEST) — e é o painel que o
  // motor reproduz. Aqui remontamos o equivalente para poder comparar.
  const porteJS = temPorte ? r.honorario : r.anestesista;

  const difs = [
    ["PORTE_R$", porteJS, porteXls],
    ["UCO_R$", r.custoOperacional, ucoXls],
    ["FILME_R$", r.filme, filmeXls],
    ["TOTAL_R$", porteJS + r.custoOperacional + r.filme, totalXls],
    // colunas vazias no xlsx significam zero; "-" (null) é o IFERROR e não se compara
  ].filter(([, js, xls]) => xls !== null && Math.abs(js - xls) > TOLERANCIA);

  if (difs.length === 0) ok++;
  else if (ESPERADAS.has(`${edicao}/${codigo}`)) intencionais++;
  else divergencias.push({ edicao, codigo, difs });
}

console.log(`\nconferidas ....... ${ok.toLocaleString("pt-BR")}`);
console.log(`divergentes ...... ${divergencias.length.toLocaleString("pt-BR")}`);
console.log(`intencionais ..... ${intencionais} (planilha erra, motor corrige)`);
console.log(`sem registro ..... ${semRegistro.toLocaleString("pt-BR")}`);

for (const d of divergencias.slice(0, 10)) {
  console.log(`\n  ${d.edicao} / ${d.codigo}`);
  for (const [campo, js, xls] of d.difs) {
    console.log(`    ${campo}: js=${js.toFixed(4)}  xlsx=${xls.toFixed(4)}`);
  }
}

// --- casos de referência, conferíveis abrindo a planilha ---
console.log("\ncasos de referência:");
const casos = [
  { rot: "40101010 ECG 2020", arg: { codigo: "40101010", edicao: "2020", anoCotacao: "2020" }, esperado: 83.7375, campo: "subtotal" },
  { rot: "40901220 US artic. 2020", arg: { codigo: "40901220", edicao: "2020", anoCotacao: "2020" }, esperado: 309.8754, campo: "subtotal" },
  { rot: "31003010 amput. 2020 (geral)", arg: { codigo: "31003010", edicao: "2020", anoCotacao: "2020" }, esperado: 10318.7, campo: "totalGeral" },
];
let falhas = divergencias.length;
for (const c of casos) {
  const r = calcular(c.arg);
  const obtido = r[c.campo];
  const passou = Math.abs(obtido - c.esperado) <= TOLERANCIA;
  if (!passou) falhas++;
  console.log(`  ${passou ? "OK  " : "FALHA"} ${c.rot}: ${obtido.toFixed(4)} (esperado ${c.esperado})`);
}

process.exit(falhas === 0 ? 0 : 1);
