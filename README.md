# Calculadora CBHPM

Substitui a planilha `CALCULO_CBHPM__V05022022-9q6ii2.xlsx`, que só funciona no Excel.
Roda em qualquer navegador — não precisa de Excel, LibreOffice nem instalação.

Mesmo padrão visual do `automation-dashboard` e do `Editor de Auditoria`.

---

## Origem dos dados

A base em `src/data/` é extraída da planilha interna
`CALCULO_CBHPM__V05022022-9q6ii2.xlsx`, que reúne a **CBHPM** (Classificação Brasileira
Hierarquizada de Procedimentos Médicos) da Associação Médica Brasileira, edições da 3ª até
2020. A planilha-fonte **não** está versionada aqui — quem for regerar os JSONs precisa
tê-la em mãos, na pasta acima da raiz do projeto.

A CBHPM é obra da AMB e tem licenciamento próprio; o uso desta ferramenta segue o
licenciamento que a instituição já possui sobre a tabela.

---

## Como entregar para os analistas

**Opção 1 — arquivo único (offline).** Copie `dist-offline/CBHPM-offline.html` para uma
pasta de rede. O analista dá dois cliques e abre no Edge. Funciona sem internet: JS, CSS,
dados, logo e fonte de ícones estão todos embutidos no arquivo.

**Opção 2 — web.** Publique `dist/` no Vercel, igual ao `automation-dashboard`
(o `vercel.json` já está aqui). Os analistas acessam por uma URL.

> A pasta `dist/` **não** abre por duplo clique — o Vite gera caminhos absolutos e o
> Chrome bloqueia módulos ES em `file://`. Para uso local é sempre o `CBHPM-offline.html`.

---

## Comandos

```bash
npm install

npm run dev             # desenvolvimento
npm run build           # gera dist/ (web) e dist-offline/CBHPM-offline.html
npm run build:web       # só o dist/
npm run build:offline   # só o arquivo único

npm run extrair         # regera src/data/*.json a partir do .xlsx (precisa de Python)
npm run validar         # confere o motor de cálculo contra a planilha
npm run smoke           # renderiza o app fora do navegador procurando erro de runtime
```

`npm run validar` compara as 43.880 linhas já calculadas pelo Excel com a saída de
`src/lib/cbhpm.js`. Resultado atual: **43.879 idênticas, 0 divergências**, mais 1
divergência intencional documentada no próprio script (uma linha em que a planilha erra).

---

## Como funciona o cálculo

Reconstruído da aba oculta `Espelho` da planilha:

```
HONORÁRIO   = valorPorte(anoCotação, porte) × fração × (acréscimoPorte + múltiploHM)
CUSTO OP.   = qtdUCO × valorUCO(anoCotação) × (acréscimoUCO + 1)
FILME       = filmes_m² × valorFilmeM2
1º auxiliar = HONORÁRIO × 30%   |  2º/3º/4º = HONORÁRIO × 20% cada
ANESTESISTA = valorPA(anoCotação, porteAnestésico) × (acréscimoPorte + múltiploHM)
TOTAL GERAL = HONORÁRIO + CUSTO OP. + FILME + auxiliares + anestesista
```

São duas listas distintas, e a planilha as tratava separadamente:

- **ANO VERSÃO** (10 opções, 3ª ed. a 2020) — define os atributos técnicos do
  procedimento: porte, fração, UCO, filme, auxiliares, porte anestésico.
- **ANO COTAÇÃO** (15 opções, 3ª ed. a 2020) — define os valores em R$.

### Nomes na tela

Os rótulos são os mesmos do painel da planilha, extraídos das caixas de texto de
`xl/drawings/drawing1.xml` e dos cabeçalhos da aba oculta `Espelho`: `INFORME O CÓDIGO`,
`ANO VERSÃO`, `ANO COTAÇÃO`, `PARÂMETROS`, `VALORES R$`, `TOTAL GERAL`,
`PARÂMETROS EM TODAS VERSÕES DE CBHPM`.

O painel original usa `PORTE`, `UCO` e `FILME` tanto para os multiplicadores de entrada
(células H4, I4, K4) quanto para as linhas de resultado. Os campos de entrada carregam a
célula de origem entre parênteses — `PORTE (H4)`, `UCO (I4)`, `FILME (M²) (K4)`,
`Múltiplo HM (M4)` — para não colidirem com os cards de resultado.

Duas coisas não têm equivalente na planilha e mantêm nome próprio: o título
**Calculadora CBHPM** (não é mais uma planilha) e o gráfico de evolução entre edições.

### Diferenças em relação à planilha original

1. **Filme.** `Espelho!D11` multiplicava a metragem por `PAINEL_CBHPM!K4`, célula
   **vazia** — o filme saía sempre R$ 0,00 para o analista. A coluna `FILME_R$` da base
   prova o valor certo: 0,34 m² × 29,74 = 10,1116. Aqui o filme é calculado, com o valor
   por m² editável em **Parâmetros**. Para reproduzir o comportamento antigo, zere o campo.

2. **Dados sujos.** A base tem `FRAÇÃO` gravada como texto com vírgula (`'0,10'`), `PORTE2`
   com espaços à esquerda (`'  1A'`) e em caixa baixa (`'9c'`), além de espaço
   não-quebrável nos nomes. O `MATCH` do Excel falhava em silêncio nesses casos e zerava
   o honorário; `scripts/extrair.py` normaliza tudo na extração.

---

## Estrutura

```
scripts/
  extrair.py             lê o .xlsx e gera src/data/*.json
  validar.mjs            confere o motor contra as colunas O:R do BD_CBHPM
  smoke.mjs              renderiza o app via SSR procurando erro de runtime
  finalizar-offline.mjs  embute o favicon e valida que o HTML é autocontido
src/
  lib/cbhpm.js           motor de cálculo (o núcleo — nenhuma dependência de React)
  data/tabelas.json      portes, UCO, porte anestésico, listas de edição e cotação
  data/procedimentos.json  43.895 registros
  tabs/Consulta.jsx      consulta unitária, no formato do painel da planilha
  tabs/TabelaCBHPM.jsx   navegação da base completa + exportar .xlsx
  assets/                logo e fonte de ícones, empacotados para funcionar offline
```

### Atualizar a base

Troque o `.xlsx` na pasta acima (o caminho está no topo de `scripts/extrair.py`) e rode:

```bash
npm run extrair && npm run validar && npm run build
```

### Trocar um ícone

A fonte Material Symbols vai subsetada em `src/assets/material-symbols-subset.woff2` com
os 14 ícones em uso. Ao adicionar um ícone novo, acrescente o nome à lista e regere o
subset — sem isso o ícone aparece como texto na tela:

```bash
node -e "
const icons='bedtime,brightness_7,calculate,compare_arrows,description,download,group,info,mop,payments,search_off,show_chart,table_rows,tune';
const css='https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names='+icons+'&display=block';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
(async()=>{
  const t=await (await fetch(css,{headers:{'User-Agent':UA}})).text();
  const u=t.match(/url\((https:[^)]+)\)/)[1];
  require('fs').writeFileSync('src/assets/material-symbols-subset.woff2', Buffer.from(await (await fetch(u)).arrayBuffer()));
})();
"
```
