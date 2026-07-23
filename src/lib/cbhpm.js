/**
 * Motor de cálculo da CBHPM.
 *
 * Porte fiel da aba oculta `Espelho` da planilha CALCULO_CBHPM__V05022022.xlsx:
 *
 *   HONORÁRIO   = valorPorte(anoCotação, porte) × fração × (multPorte + multiploHM)
 *   CUSTO OP.   = qtdUCO × valorUCO(anoCotação) × (multUCO + 1)
 *   FILME       = filmes_m² × valorFilmeM2
 *   1º auxiliar = HONORÁRIO × 30%   |  2º/3º/4º = HONORÁRIO × 20% cada
 *   ANESTESISTA = valorPA(anoCotação, porteAnestésico) × (multPorte + multiploHM)
 *   TOTAL GERAL = HONORÁRIO + CUSTO OP. + FILME + auxiliares + anestesista
 *
 * A *edição* define os atributos técnicos do procedimento (porte, fração, UCO,
 * filme, auxiliares, PA). O *ano de cotação* define os valores em R$. São listas
 * distintas — 10 edições contra 15 anos de cotação.
 *
 * Divergência conhecida em relação à planilha: `Espelho!D11` calcula o filme com
 * `PAINEL_CBHPM!K4`, célula vazia, então o painel sempre zerava esse item. A coluna
 * FILME_R$ do banco usa R$ 29,74/m². Aqui o filme é calculado de verdade, com o
 * valor exposto como parâmetro — passe `valorFilmeM2: 0` para o comportamento antigo.
 */

// `with { type: "json" }` mantém o módulo executável tanto pelo Vite quanto direto
// pelo Node — é assim que scripts/validar.mjs confere o motor contra a planilha.
import tabelas from "../data/tabelas.json" with { type: "json" };
import procedimentos from "../data/procedimentos.json" with { type: "json" };

// posições dentro de cada registro de procedimentos.json (ver tabelas.campos)
const VERSAO = 0;
const CODIGO = 1;
const NOME = 2;
const FRACAO = 3;
const PORTE = 4;
const UCO = 5;
const NUM_AUX = 6;
const PORTE_ANEST = 7;
const FILMES = 8;
const ROL = 9;
const TUSS = 10;
const DUT = 11;

export const EDICOES = tabelas.edicoes;
export const ANOS_COTACAO = tabelas.anosCotacao;
export const VALOR_FILME_M2 = tabelas.valorFilmeM2;
export const PROCEDIMENTOS = procedimentos;

/** Percentual do honorário pago a cada auxiliar, conforme `Espelho!F9:F12`. */
const PERCENTUAL_AUXILIAR = [0.3, 0.2, 0.2, 0.2];

/** Índice `edição+código` → registro. Substitui o VLOOKUP linear em 43 mil linhas. */
const porChave = new Map();
/** Índice `código` → um registro qualquer, para busca por nome/código sem edição. */
const porCodigo = new Map();

for (const registro of procedimentos) {
  porChave.set(registro[VERSAO] + registro[CODIGO], registro);
  if (!porCodigo.has(registro[CODIGO])) porCodigo.set(registro[CODIGO], registro);
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function valorPorte(anoCotacao, porte) {
  if (!porte) return 0;
  return num(tabelas.portes[anoCotacao + porte]);
}

function valorUCO(anoCotacao) {
  return num(tabelas.uco[anoCotacao]);
}

function valorAnestesista(anoCotacao, porteAnest) {
  if (!porteAnest) return 0;
  return num(tabelas.anestesico[anoCotacao + porteAnest]);
}

/**
 * Calcula um procedimento numa edição e num ano de cotação.
 *
 * Os multiplicadores reproduzem as células `H4`, `I4` e `M4` do painel: por padrão
 * `multPorte = 0` e `multiploHM = 1`, o que resulta em fator 1 — o mesmo estado em
 * que a planilha foi salva.
 *
 * @returns {object|null} `null` quando o código não existe na edição informada.
 */
export function calcular({
  codigo,
  edicao,
  anoCotacao,
  multPorte = 0,
  multUCO = 0,
  multiploHM = 1,
  valorFilmeM2 = VALOR_FILME_M2,
}) {
  const registro = porChave.get(edicao + String(codigo).trim());
  if (!registro) return null;

  const fracao = num(registro[FRACAO]);
  const qtdUCO = num(registro[UCO]);
  const qtdFilmes = num(registro[FILMES]);
  const numAux = Number(registro[NUM_AUX]) || 0;

  const fatorPorte = multPorte + multiploHM;
  const honorario = valorPorte(anoCotacao, registro[PORTE]) * fracao * fatorPorte;
  const custoOperacional = qtdUCO * valorUCO(anoCotacao) * (multUCO + 1);
  const filme = qtdFilmes * num(valorFilmeM2);
  const subtotal = honorario + custoOperacional + filme;

  const auxiliares = PERCENTUAL_AUXILIAR.map((pct, i) =>
    i < numAux ? honorario * pct : 0,
  );
  const anestesista = valorAnestesista(anoCotacao, registro[PORTE_ANEST]) * fatorPorte;

  const totalAuxiliares = auxiliares.reduce((a, b) => a + b, 0);

  return {
    codigo: registro[CODIGO],
    procedimento: registro[NOME],
    edicao: registro[VERSAO],
    anoCotacao,
    porte: registro[PORTE],
    fracao: registro[FRACAO],
    uco: registro[UCO],
    numAux: registro[NUM_AUX],
    porteAnest: registro[PORTE_ANEST],
    filmes: registro[FILMES],
    rol: registro[ROL],
    tuss: registro[TUSS],
    dut: registro[DUT],
    honorario,
    custoOperacional,
    filme,
    subtotal,
    auxiliares,
    totalAuxiliares,
    anestesista,
    totalGeral: subtotal + totalAuxiliares + anestesista,
  };
}

/**
 * Série do total do procedimento nas 10 edições, cada uma cotada no seu próprio ano.
 * Reproduz o gráfico de linha de `'Valores Portes_CBHPM'!C76:L76`.
 */
export function serieHistorica(codigo, opcoes = {}) {
  return EDICOES.map((edicao) => {
    const r = calcular({ ...opcoes, codigo, edicao, anoCotacao: edicao });
    return {
      edicao: rotuloEdicao(edicao),
      total: r ? r.totalGeral : null,
      subtotal: r ? r.subtotal : null,
    };
  });
}

/**
 * Uma linha por edição com os parâmetros técnicos e o total.
 * Reproduz o bloco "PARÂMETROS EM TODAS VERSÕES DE CBHPM" do painel.
 */
export function comparativoEdicoes(codigo, opcoes = {}) {
  return EDICOES.map((edicao) => {
    const r = calcular({ ...opcoes, codigo, edicao, anoCotacao: edicao });
    return r
      ? { ...r, encontrado: true, rotulo: rotuloEdicao(edicao) }
      : { edicao, rotulo: rotuloEdicao(edicao), encontrado: false };
  });
}

/**
 * Busca por código (prefixo) ou por trecho do nome do procedimento.
 * A planilha exigia saber o código de cor; os nomes já estão na base.
 */
export function buscar(termo, limite = 30) {
  const t = termo.trim().toLowerCase();
  if (t.length < 2) return [];

  const soDigitos = /^\d+$/.test(t);
  const achados = [];

  for (const [codigo, registro] of porCodigo) {
    const bate = soDigitos
      ? codigo.startsWith(t)
      : codigo.includes(t) || (registro[NOME] || "").toLowerCase().includes(t);
    if (bate) {
      achados.push({ codigo, nome: registro[NOME] });
      if (achados.length >= limite) break;
    }
  }
  return achados;
}

/** Em quais edições um código existe. */
export function edicoesDoCodigo(codigo) {
  const c = String(codigo).trim();
  return EDICOES.filter((e) => porChave.has(e + c));
}

/** "5_2008" → "5ª ed. 2008"; "2020" → "2020". */
export function rotuloEdicao(edicao) {
  if (edicao === "3_ED") return "3ª ed.";
  if (edicao === "4_ED") return "4ª ed.";
  if (edicao === "5_2008") return "5ª ed. 2008";
  if (edicao === "5_2009") return "5ª ed. 2009";
  return edicao;
}
