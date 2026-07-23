/**
 * Renderiza o app fora do navegador para pegar erro de runtime que o build não pega
 * (hook mal usado, variável inexistente, prop errada). Não substitui olhar a tela,
 * mas falha barulhento antes de chegar lá.
 *
 * Uso:  node scripts/smoke.mjs
 */

import { renderToString } from "react-dom/server";
import { createServer } from "vite";
import React from "react";

// o App lê o tema do localStorage já no useState inicial
const memoria = new Map();
globalThis.localStorage = {
  getItem: (k) => memoria.get(k) ?? null,
  setItem: (k, v) => memoria.set(k, String(v)),
  removeItem: (k) => memoria.delete(k),
};

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });

let falhas = 0;
const avisos = [];
const erroOriginal = console.error;
console.error = (...args) => {
  avisos.push(args.join(" "));
  erroOriginal(...args);
};

try {
  // --- campos de parâmetro: apagar o conteúdo tem que deixar o campo vazio ---
  const { NUMERO_PARCIAL, paraNumero } = await vite.ssrLoadModule("/src/lib/formatUtils.js");

  const digitacao = [
    ["", true, 0], // apagar tudo — o caso que estava travado no 0
    ["-", true, 0],
    ["0", true, 0],
    ["0,", true, 0], // passo intermediário ao digitar 0,5
    ["0.", true, 0],
    ["0,5", true, 0.5], // decimal com vírgula, natural em pt-BR
    ["0.5", true, 0.5],
    ["29,74", true, 29.74],
    ["-0,3", true, -0.3],
    ["1a", false, null], // letra é recusada antes de virar estado
    ["0,,5", false, null],
    ["abc", false, null],
  ];

  console.log("campos de parâmetro");
  for (const [entrada, aceita, esperado] of digitacao) {
    const passaFiltro = NUMERO_PARCIAL.test(entrada);
    let ok = passaFiltro === aceita;
    if (ok && aceita) ok = paraNumero(entrada) === esperado;
    console.log(
      `  ${ok ? "OK   " : "FALHA"} ${JSON.stringify(entrada).padEnd(8)}` +
        (aceita ? `aceito → ${esperado}` : "recusado"),
    );
    if (!ok) falhas++;
  }

  // --- estado que sobrevive à troca de aba ---
  const { useEstadoPersistente } = await vite.ssrLoadModule(
    "/src/hooks/useEstadoPersistente.js",
  );

  console.log("\nestado persistente");
  const casos = [];

  // grava e lê de volta, simulando desmontar e remontar a aba.
  // a guarda do useRef faz a gravação acontecer uma vez só — sem ela, o setter roda a
  // cada render e o React aborta com "Too many re-renders"
  function Sonda({ chave, inicial, gravar }) {
    const [valor, setValor] = useEstadoPersistente(chave, inicial);
    const feito = React.useRef(false);
    if (gravar !== undefined && !feito.current) {
      feito.current = true;
      setValor(gravar);
    }
    return React.createElement("i", null, JSON.stringify(valor));
  }
  renderToString(React.createElement(Sonda, { chave: "t.codigo", inicial: "40101010", gravar: "31003010" }));
  casos.push([
    "valor volta depois de remontar",
    renderToString(React.createElement(Sonda, { chave: "t.codigo", inicial: "40101010" })).includes("31003010"),
  ]);

  renderToString(React.createElement(Sonda, { chave: "t.bool", inicial: false, gravar: true }));
  casos.push([
    "booleano sobrevive (painel aberto)",
    renderToString(React.createElement(Sonda, { chave: "t.bool", inicial: false })).includes("true"),
  ]);

  // valor cru gravado por uma versão anterior, antes do JSON
  memoria.set("t.legado", "escuro");
  casos.push([
    "aproveita valor antigo sem JSON",
    renderToString(React.createElement(Sonda, { chave: "t.legado", inicial: "claro" })).includes("escuro"),
  ]);

  // file:// pode recusar o storage — não pode derrubar a página
  const real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => { throw new Error("storage bloqueado"); },
    setItem: () => { throw new Error("storage bloqueado"); },
  };
  let sobreviveu = true;
  try {
    renderToString(React.createElement(Sonda, { chave: "t.x", inicial: "padrão", gravar: "novo" }));
  } catch {
    sobreviveu = false;
  }
  globalThis.localStorage = real;
  casos.push(["renderiza com storage bloqueado", sobreviveu]);

  for (const [nome, ok] of casos) {
    console.log(`  ${ok ? "OK   " : "FALHA"} ${nome}`);
    if (!ok) falhas++;
  }

  const { default: App } = await vite.ssrLoadModule("/src/App.jsx");

  for (const aba of ["consulta", "tabela"]) {
    memoria.set("abaCBHPM", aba);
    const html = renderToString(React.createElement(App));

    const checagens = [
      ["título", html.includes("Calculadora CBHPM")],
      ["abas", html.includes("Tabela CBHPM") && html.includes("Consulta")],
      [
        "conteúdo da aba",
        aba === "consulta"
          ? html.includes("VALORES R$") && html.includes("TOTAL GERAL")
          : html.includes("Detalhamento") && html.includes("Base completa"),
      ],
      ["ícones", html.includes("material-symbols-outlined")],
    ];

    // a consulta abre em 40101010 / 2020, cujo total é R$ 83,74 na planilha
    if (aba === "consulta") {
      // R3, R4 e Q14 do painel da planilha, para o mesmo procedimento
      checagens.push(["PORTE do ECG (R$ 67,32)", html.includes("67,32")]);
      checagens.push(["UCO do ECG (R$ 16,42)", html.includes("16,42")]);
      checagens.push(["TOTAL GERAL do ECG (R$ 83,74)", html.includes("83,74")]);
      checagens.push(["nome do procedimento", html.includes("ECG convencional")]);
      // rótulos idênticos ao painel da planilha
      for (const rotulo of [
        "INFORME O CÓDIGO",
        "ANO VERSÃO",
        "ANO COTAÇÃO",
        "PARÂMETROS EM TODAS VERSÕES DE CBHPM",
        "PORTE ANESTÉSICO",
      ]) {
        checagens.push([`rótulo "${rotulo}"`, html.includes(rotulo)]);
      }
    } else {
      checagens.push(["contagem da base", html.includes("43.895")]);
      checagens.push(["rótulo \"ANO VERSÃO\"", html.includes("ANO VERSÃO")]);
    }

    console.log(`\naba "${aba}" — ${(html.length / 1024).toFixed(0)} KB de HTML`);
    for (const [nome, ok] of checagens) {
      console.log(`  ${ok ? "OK   " : "FALHA"} ${nome}`);
      if (!ok) falhas++;
    }
  }
} catch (e) {
  console.error("\nerro ao renderizar:", e);
  falhas++;
} finally {
  await vite.close();
  console.error = erroOriginal;
}

// warnings do React (key faltando, prop inválida) contam como falha
const reais = avisos.filter((a) => !a.includes("useLayoutEffect does nothing on the server"));
if (reais.length) {
  console.log(`\n${reais.length} aviso(s) do React:`);
  for (const a of reais.slice(0, 10)) console.log("  " + a.slice(0, 200));
  falhas += reais.length;
}

console.log(falhas === 0 ? "\nsmoke OK" : `\n${falhas} problema(s)`);
process.exit(falhas === 0 ? 0 : 1);
