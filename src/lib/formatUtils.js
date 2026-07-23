const FMT_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const FMT_BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

// Colunas numeric do Postgres podem chegar como string via PostgREST
export function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatarMoedaBR(v) {
  const n = num(v);
  return n == null ? "—" : FMT_BRL.format(n);
}

export function formatarMoedaCompactaBR(v) {
  const n = num(v);
  return n == null ? "—" : FMT_BRL_COMPACT.format(n);
}

export function formatarPercentualBR(v, casas = 1) {
  const n = num(v);
  return n == null ? "—" : n.toFixed(casas).replace(".", ",") + "%";
}

/**
 * Texto digitado → número, aceitando vírgula ou ponto como separador decimal.
 * Vazio e lixo viram 0. Diferente de `num()`, nunca devolve null: é para campo de
 * formulário, onde "sem valor" significa o valor neutro do cálculo.
 */
export function paraNumero(txt) {
  const n = parseFloat(String(txt).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * O que se aceita enquanto o usuário digita num campo numérico. Precisa admitir
 * estados incompletos — vazio, só o sinal, um separador decimal solto — senão o
 * campo trava no meio da digitação.
 */
export const NUMERO_PARCIAL = /^-?\d*[.,]?\d*$/;
