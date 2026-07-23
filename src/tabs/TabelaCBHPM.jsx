import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import {
  ANOS_COTACAO,
  EDICOES,
  PROCEDIMENTOS,
  VALOR_FILME_M2,
  calcular,
  rotuloEdicao,
} from "../lib/cbhpm";
import { useEstadoPersistente } from "../hooks/useEstadoPersistente";
import { formatarMoedaBR } from "../lib/formatUtils";

const ITENS_POR_PAGINA = 20;
const ULTIMA_EDICAO = EDICOES[EDICOES.length - 1];
const ULTIMO_ANO = ANOS_COTACAO[ANOS_COTACAO.length - 1];

// posições dentro de cada registro de procedimentos.json
const VERSAO = 0;
const CODIGO = 1;
const NOME = 2;
const PORTE = 4;

/** Portes existentes na base, na ordem natural (1A, 1B, ... 14C) e não alfabética. */
const PORTES = [...new Set(PROCEDIMENTOS.map((r) => r[PORTE]).filter(Boolean))].sort(
  (a, b) => (parseInt(a, 10) - parseInt(b, 10)) || a.localeCompare(b),
);

export default function TabelaCBHPM({ tema, cores }) {
  // persistente pelo mesmo motivo da aba Consulta; chaves próprias, então o ano escolhido
  // aqui não mexe no da outra aba
  const [busca, setBusca] = useEstadoPersistente("cbhpm.tabela.busca", "");
  const [edicao, setEdicao] = useEstadoPersistente("cbhpm.tabela.edicao", ULTIMA_EDICAO);
  const [anoCotacao, setAnoCotacao] = useEstadoPersistente(
    "cbhpm.tabela.anoCotacao",
    ULTIMO_ANO,
  );
  const [porte, setPorte] = useEstadoPersistente("cbhpm.tabela.porte", "Todos");
  // página não persiste: já é zerada a cada mudança de filtro, e guardar a página de uma
  // lista que pode ter mudado só produziria página vazia
  const [pagina, setPagina] = useState(1);

  const accent = tema === "escuro" ? "#FFCB05" : "#FF0073";
  const estiloCard = { backgroundColor: cores.card, color: cores.texto };

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return PROCEDIMENTOS.filter((r) => {
      if (r[VERSAO] !== edicao) return false;
      if (porte !== "Todos" && r[PORTE] !== porte) return false;
      if (!t) return true;
      return r[CODIGO].includes(t) || (r[NOME] || "").toLowerCase().includes(t);
    });
  }, [busca, edicao, porte]);

  /** Calcula só a página visível — recalcular 43 mil linhas a cada tecla é desnecessário. */
  const calculados = useMemo(() => {
    const inicio = (pagina - 1) * ITENS_POR_PAGINA;
    return filtrados
      .slice(inicio, inicio + ITENS_POR_PAGINA)
      .map((r) => calcular({ codigo: r[CODIGO], edicao, anoCotacao }));
  }, [filtrados, pagina, edicao, anoCotacao]);

  useEffect(() => {
    setPagina(1);
  }, [busca, edicao, porte, anoCotacao]);

  const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA);
  const paginaSegura = Math.min(Math.max(1, pagina), Math.max(1, totalPaginas));
  const inicio = (paginaSegura - 1) * ITENS_POR_PAGINA;

  const PAGINAS_VISIVEIS = 5;
  const metade = Math.floor(PAGINAS_VISIVEIS / 2);
  let inicioPaginas = Math.max(1, paginaSegura - metade);
  const fimPaginas = Math.min(totalPaginas, inicioPaginas + PAGINAS_VISIVEIS - 1);
  if (fimPaginas - inicioPaginas + 1 < PAGINAS_VISIVEIS) {
    inicioPaginas = Math.max(1, fimPaginas - PAGINAS_VISIVEIS + 1);
  }
  const paginasVisiveis = Array.from(
    { length: Math.max(0, fimPaginas - inicioPaginas + 1) },
    (_, i) => inicioPaginas + i,
  );

  function irParaPagina(p) {
    setPagina(Math.min(Math.max(1, p), totalPaginas));
  }

  function exportarExcel() {
    // exporta o filtro inteiro, não só a página — é o caso de uso de conferência em massa
    const linhas = filtrados.map((r) => {
      const c = calcular({ codigo: r[CODIGO], edicao, anoCotacao });
      return [
        c.codigo,
        c.procedimento,
        c.porte ?? "-",
        c.fracao ?? "-",
        c.uco ?? "-",
        c.filmes ?? "-",
        c.numAux ?? "-",
        c.porteAnest ?? "-",
        c.rol ?? "-",
        c.tuss ?? "-",
        c.dut ?? "-",
        c.honorario,
        c.custoOperacional,
        c.filme,
        c.totalAuxiliares,
        c.anestesista,
        c.totalGeral,
      ];
    });

    // cabeçalhos com os nomes das colunas de BD_CBHPM, para o arquivo exportado bater
    // coluna a coluna com a base original; as três últimas só existem no painel
    const ws = XLSX.utils.aoa_to_sheet([
      ["TABELA CBHPM"],
      ["ANO VERSÃO", rotuloEdicao(edicao)],
      ["ANO COTAÇÃO", rotuloEdicao(anoCotacao)],
      ["FILME (M²) — R$ por m²", VALOR_FILME_M2],
      ["Registros", linhas.length],
      [],
      [
        "Código",
        "Procedimento",
        "PORTE2",
        "FRAÇÃO",
        "Custo Operacional",
        "Filmes",
        "Número de Auxiliares",
        "Portes Anestésico",
        "ROL",
        "TUSS",
        "DUT",
        "PORTE_R$",
        "UCO_R$",
        "FILME_R$",
        "AUXILIARES_R$",
        "ANESTESISTA_R$",
        "TOTAL GERAL",
      ],
      ...linhas,
    ]);
    ws["!cols"] = [
      { wch: 12 }, { wch: 60 }, { wch: 7 }, { wch: 8 }, { wch: 8 }, { wch: 10 },
      { wch: 13 }, { wch: 16 }, { wch: 9 }, { wch: 7 }, { wch: 7 }, { wch: 15 },
      { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 16 }, { wch: 15 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CBHPM");
    XLSX.writeFile(wb, `cbhpm_${edicao}_cotacao_${anoCotacao}.xlsx`);
  }

  return (
    <>
      {/* CARDS */}
      <div className="cards">
        <div className="card animated-card" style={estiloCard}>
          <h3>Procedimentos na edição</h3>
          <p>
            {PROCEDIMENTOS.filter((r) => r[VERSAO] === edicao).length.toLocaleString(
              "pt-BR",
            )}
          </p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>{rotuloEdicao(edicao)}</p>
        </div>
        <div className="card animated-card" style={estiloCard}>
          <h3>No filtro atual</h3>
          <p style={{ color: accent }}>{filtrados.length.toLocaleString("pt-BR")}</p>
        </div>
        <div className="card animated-card" style={estiloCard}>
          <h3>Base completa</h3>
          <p>{PROCEDIMENTOS.length.toLocaleString("pt-BR")}</p>
          <p style={{ fontSize: 13, fontWeight: 400 }}>
            {EDICOES.length} edições · {ANOS_COTACAO.length} anos de cotação
          </p>
        </div>
      </div>

      {/* FILTROS */}
      <div className="filtro">
        <div className="linha-filtros">
          <div className="grupo-filtro grupo-filtro-largo">
            <label>BUSCAR</label>
            <input
              className="filtro-processo"
              style={{ maxWidth: "none", flex: 1, minWidth: 0 }}
              type="text"
              placeholder="Código ou nome do procedimento"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="grupo-filtro">
            <label>ANO VERSÃO</label>
            <select value={edicao} onChange={(e) => setEdicao(e.target.value)}>
              {EDICOES.map((e) => (
                <option key={e} value={e}>
                  {rotuloEdicao(e)}
                </option>
              ))}
            </select>
          </div>
          <div className="grupo-filtro">
            <label>ANO COTAÇÃO</label>
            <select value={anoCotacao} onChange={(e) => setAnoCotacao(e.target.value)}>
              {ANOS_COTACAO.map((a) => (
                <option key={a} value={a}>
                  {rotuloEdicao(a)}
                </option>
              ))}
            </select>
          </div>
          <div className="grupo-filtro">
            <label>PORTE</label>
            <select value={porte} onChange={(e) => setPorte(e.target.value)}>
              <option>Todos</option>
              {PORTES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <button
            className="btn-tema"
            onClick={() => {
              setBusca("");
              setPorte("Todos");
              setEdicao(ULTIMA_EDICAO);
              setAnoCotacao(ULTIMO_ANO);
            }}
          >
            <span className="material-symbols-outlined">mop</span>
            Limpar Filtros
          </button>
        </div>
      </div>

      {/* TABELA */}
      <div className="tabela-container" style={{ ...estiloCard, marginTop: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(128,128,128,0.2)",
          }}
        >
          <h3 style={{ margin: 0 }}>Detalhamento</h3>
          <span style={{ fontSize: "13px", opacity: 0.8 }}>
            {filtrados.length === 0
              ? "nenhum registro"
              : `Mostrando ${inicio + 1}—${Math.min(
                  inicio + ITENS_POR_PAGINA,
                  filtrados.length,
                )} de ${filtrados.length.toLocaleString("pt-BR")}`}
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                {[
                  "CÓDIGO",
                  "PROCEDIMENTO",
                  "PORTE",
                  "FRAÇÃO",
                  "UCO",
                  "AUXILIARES",
                  "PORTE R$",
                  "UCO R$",
                  "TOTAL GERAL",
                ].map((h) => (
                  <th key={h} style={{ color: cores.texto }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calculados.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ color: cores.texto, padding: 32 }}>
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                calculados.map((c) => (
                  <tr key={c.codigo}>
                    <td style={{ color: cores.texto }}>{c.codigo}</td>
                    <td style={{ color: cores.texto, textAlign: "left", minWidth: 320 }}>
                      {c.procedimento}
                    </td>
                    <td style={{ color: cores.texto }}>{c.porte ?? "—"}</td>
                    <td className="num" style={{ color: cores.texto }}>
                      {c.fracao ?? "—"}
                    </td>
                    <td className="num" style={{ color: cores.texto }}>
                      {c.uco ?? "—"}
                    </td>
                    <td style={{ color: cores.texto }}>{c.numAux ?? "—"}</td>
                    <td className="num" style={{ color: cores.texto }}>
                      {formatarMoedaBR(c.honorario)}
                    </td>
                    <td className="num" style={{ color: cores.texto }}>
                      {formatarMoedaBR(c.custoOperacional)}
                    </td>
                    <td className="num destaque-linha" style={{ color: cores.texto }}>
                      {formatarMoedaBR(c.totalGeral)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="paginacao" style={{ borderTop: "1px solid rgba(128,128,128,0.2)" }}>
            <button
              className="paginacao-btn"
              onClick={() => irParaPagina(paginaSegura - 1)}
              disabled={paginaSegura <= 1}
              style={{
                background: tema === "escuro" ? "#374151" : "#e5e7eb",
                color: cores.texto,
                fontWeight: "bold",
              }}
            >
              Anterior
            </button>
            {paginasVisiveis[0] > 1 && (
              <>
                <button
                  className="paginacao-btn"
                  onClick={() => irParaPagina(1)}
                  style={{ background: cores.card, color: cores.texto }}
                >
                  1
                </button>
                {paginasVisiveis[0] > 2 && (
                  <span style={{ color: cores.texto, opacity: 0.5 }}>...</span>
                )}
              </>
            )}
            {paginasVisiveis.map((p) => (
              <button
                key={p}
                className={`paginacao-btn ${p === paginaSegura ? "paginacao-ativa" : ""}`}
                onClick={() => irParaPagina(p)}
                style={{
                  background:
                    p === paginaSegura ? accent : tema === "escuro" ? "#374151" : "#e5e7eb",
                  color: p === paginaSegura ? "#fff" : cores.texto,
                }}
              >
                {p}
              </button>
            ))}
            {paginasVisiveis[paginasVisiveis.length - 1] < totalPaginas && (
              <>
                {paginasVisiveis[paginasVisiveis.length - 1] < totalPaginas - 1 && (
                  <span style={{ color: cores.texto, opacity: 0.5 }}>...</span>
                )}
                <button
                  className="paginacao-btn"
                  onClick={() => irParaPagina(totalPaginas)}
                  style={{ background: cores.card, color: cores.texto }}
                >
                  {totalPaginas}
                </button>
              </>
            )}
            <button
              className="paginacao-btn"
              onClick={() => irParaPagina(paginaSegura + 1)}
              disabled={paginaSegura >= totalPaginas}
              style={{
                background: tema === "escuro" ? "#374151" : "#e5e7eb",
                color: cores.texto,
                fontWeight: "bold",
              }}
            >
              Próximo
            </button>
          </div>
        )}
      </div>

      <div className="acoes-tabela">
        <button className="btn-tema" onClick={exportarExcel} disabled={filtrados.length === 0}>
          <span className="material-symbols-outlined">download</span>
          Exportar Planilha ({filtrados.length.toLocaleString("pt-BR")})
        </button>
      </div>
    </>
  );
}
