import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ANOS_COTACAO,
  EDICOES,
  VALOR_FILME_M2,
  buscar,
  calcular,
  comparativoEdicoes,
  edicoesDoCodigo,
  rotuloEdicao,
  serieHistorica,
} from "../lib/cbhpm";
import { useEstadoPersistente } from "../hooks/useEstadoPersistente";
import { NUMERO_PARCIAL, formatarMoedaBR, paraNumero } from "../lib/formatUtils";

const ULTIMA_EDICAO = EDICOES[EDICOES.length - 1];
const ULTIMO_ANO = ANOS_COTACAO[ANOS_COTACAO.length - 1];

/** Number → "0,750" no padrão pt-BR; null vira travessão. */
function numeroBR(v, casas = 3) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  });
}

const texto = (v) => (v == null || v === "" ? "—" : v);

/**
 * Campo numérico dos parâmetros.
 *
 * Guarda o texto cru, não o número: com `value` numérico, apagar o conteúdo fazia
 * `Number("")` virar 0 e o zero reaparecia antes de dar tempo de digitar. É `type="text"`
 * porque `type="number"` devolve `""` para valores incompletos como "0." e recusa a
 * vírgula — o `inputMode` mantém o teclado numérico no celular.
 */
function CampoNumero({ rotulo, valor, aoMudar }) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        onChange={(e) => {
          if (NUMERO_PARCIAL.test(e.target.value)) aoMudar(e.target.value);
        }}
      />
    </label>
  );
}

/** Campo de busca que aceita código ou nome, com sugestões navegáveis pelo teclado. */
function BuscaProcedimento({ valor, aoEscolher, cores, tema }) {
  const [termo, setTermo] = useState(valor);
  const [aberto, setAberto] = useState(false);
  const [marcada, setMarcada] = useState(0);
  const wrapper = useRef(null);

  useEffect(() => setTermo(valor), [valor]);

  useEffect(() => {
    function fora(e) {
      if (wrapper.current && !wrapper.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const sugestoes = useMemo(() => (aberto ? buscar(termo) : []), [termo, aberto]);

  function escolher(s) {
    setTermo(s.codigo);
    setAberto(false);
    aoEscolher(s.codigo);
  }

  function aoTeclar(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMarcada((m) => Math.min(m + 1, sugestoes.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMarcada((m) => Math.max(m - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (sugestoes[marcada]) escolher(sugestoes[marcada]);
      else {
        setAberto(false);
        aoEscolher(termo.trim());
      }
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <div className="autocomplete" ref={wrapper}>
      <input
        type="text"
        placeholder="Código ou nome do procedimento"
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAberto(true);
          setMarcada(0);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={aoTeclar}
      />
      {aberto && sugestoes.length > 0 && (
        <ul
          className="sugestoes"
          style={{ background: tema === "escuro" ? "#18212F" : "#fff", color: cores.texto }}
        >
          {sugestoes.map((s, i) => (
            <li
              key={s.codigo}
              className={i === marcada ? "marcada" : ""}
              onMouseEnter={() => setMarcada(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(s);
              }}
            >
              <span className="cod">{s.codigo}</span>
              <span className="nome">{s.nome}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Consulta({ tema, cores }) {
  // persistente: trocar de aba desmonta este componente, e o que o analista escolheu
  // precisa continuar lá quando ele voltar
  const [codigo, setCodigo] = useEstadoPersistente("cbhpm.consulta.codigo", "40101010");
  const [edicao, setEdicao] = useEstadoPersistente("cbhpm.consulta.edicao", ULTIMA_EDICAO);
  const [anoCotacao, setAnoCotacao] = useEstadoPersistente(
    "cbhpm.consulta.anoCotacao",
    ULTIMO_ANO,
  );
  const [mostrarParametros, setMostrarParametros] = useEstadoPersistente(
    "cbhpm.consulta.mostrarParametros",
    false,
  );

  // texto no estado, número derivado — ver CampoNumero
  const [multiploHMTxt, setMultiploHMTxt] = useEstadoPersistente(
    "cbhpm.consulta.multiploHM",
    "1",
  );
  const [multPorteTxt, setMultPorteTxt] = useEstadoPersistente(
    "cbhpm.consulta.multPorte",
    "0",
  );
  const [multUCOTxt, setMultUCOTxt] = useEstadoPersistente("cbhpm.consulta.multUCO", "0");
  const [valorFilmeTxt, setValorFilmeTxt] = useEstadoPersistente(
    "cbhpm.consulta.valorFilme",
    String(VALOR_FILME_M2),
  );

  const multiploHM = paraNumero(multiploHMTxt);
  const multPorte = paraNumero(multPorteTxt);
  const multUCO = paraNumero(multUCOTxt);
  const valorFilmeM2 = paraNumero(valorFilmeTxt);

  const accent = tema === "escuro" ? "#FFCB05" : "#FF0073";
  const parametros = { multiploHM, multPorte, multUCO, valorFilmeM2 };

  const resultado = useMemo(
    () => calcular({ codigo, edicao, anoCotacao, ...parametros }),
    [codigo, edicao, anoCotacao, multiploHM, multPorte, multUCO, valorFilmeM2],
  );

  const serie = useMemo(
    () => (resultado ? serieHistorica(codigo, parametros) : []),
    [codigo, resultado, multiploHM, multPorte, multUCO, valorFilmeM2],
  );

  const comparativo = useMemo(
    () => (resultado ? comparativoEdicoes(codigo, parametros) : []),
    [codigo, resultado, multiploHM, multPorte, multUCO, valorFilmeM2],
  );

  const disponiveis = useMemo(() => edicoesDoCodigo(codigo), [codigo]);

  // se o código não existe na edição escolhida mas existe em outra, vai para ela
  useEffect(() => {
    if (!resultado && disponiveis.length > 0 && !disponiveis.includes(edicao)) {
      setEdicao(disponiveis[disponiveis.length - 1]);
    }
  }, [resultado, disponiveis, edicao]);

  const estiloCard = { backgroundColor: cores.card, color: cores.texto };

  function limpar() {
    setMultiploHMTxt("1");
    setMultPorteTxt("0");
    setMultUCOTxt("0");
    setValorFilmeTxt(String(VALOR_FILME_M2));
    setEdicao(ULTIMA_EDICAO);
    setAnoCotacao(ULTIMO_ANO);
  }

  return (
    <>
      {/* FILTROS */}
      <div className="filtro">
        <div className="linha-filtros">
          {/* .grupo-filtro-largo usa flex-basis em vez de min-width: deixa encolher e
              quebrar a linha, em vez de transbordar por cima do rótulo seguinte */}
          <div className="grupo-filtro grupo-filtro-largo">
            <label>INFORME O CÓDIGO</label>
            <BuscaProcedimento
              valor={codigo}
              aoEscolher={setCodigo}
              cores={cores}
              tema={tema}
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
          <button className="btn-tema" onClick={() => setMostrarParametros((v) => !v)}>
            <span className="material-symbols-outlined">tune</span>
            Parâmetros
          </button>
          <button className="btn-tema" onClick={limpar}>
            <span className="material-symbols-outlined">mop</span>
            Restaurar padrão
          </button>
        </div>
      </div>

      {mostrarParametros && (
        <div className="parametros" style={estiloCard}>
          {/* nomes do painel da planilha; a célula de origem entre parênteses distingue
              estas entradas dos cards de resultado, que se chamam PORTE, UCO e FILME */}
          <CampoNumero rotulo="PORTE (H4)" valor={multPorteTxt} aoMudar={setMultPorteTxt} />
          <CampoNumero rotulo="UCO (I4)" valor={multUCOTxt} aoMudar={setMultUCOTxt} />
          <CampoNumero
            rotulo="FILME (M²) (K4)"
            valor={valorFilmeTxt}
            aoMudar={setValorFilmeTxt}
          />
          <CampoNumero
            rotulo="Múltiplo HM (M4)"
            valor={multiploHMTxt}
            aoMudar={setMultiploHMTxt}
          />
          <div className="campo" style={{ justifyContent: "flex-end", minWidth: 220 }}>
            <span style={{ opacity: 0.75 }}>
              O honorário é multiplicado por{" "}
              <strong>{numeroBR(multPorte + multiploHM, 2)}</strong>, e a UCO por{" "}
              <strong>{numeroBR(multUCO + 1, 2)}</strong>.
            </span>
          </div>
        </div>
      )}

      {!resultado ? (
        <div className="vazio" style={{ ...estiloCard, marginTop: 20 }}>
          <span className="material-symbols-outlined">search_off</span>
          {disponiveis.length === 0 ? (
            <>
              Nenhum procedimento com o código <strong>{codigo || "—"}</strong> na base.
              <br />
              Digite parte do nome para buscar pelas 43.895 entradas.
            </>
          ) : (
            <>
              O código <strong>{codigo}</strong> não existe na edição{" "}
              <strong>{rotuloEdicao(edicao)}</strong>.
              <br />
              Disponível em: {disponiveis.map(rotuloEdicao).join(", ")}.
            </>
          )}
        </div>
      ) : (
        <>
          {/* IDENTIFICAÇÃO */}
          <div
            className="card animated-card"
            style={{ ...estiloCard, marginTop: 20, width: "100%" }}
          >
            <h3 style={{ opacity: 0.7, fontSize: 13 }}>
              {resultado.codigo} · {rotuloEdicao(resultado.edicao)} · cotação{" "}
              {rotuloEdicao(anoCotacao)}
            </h3>
            <p style={{ fontSize: 18, marginBottom: 0 }}>{resultado.procedimento}</p>
          </div>

          {/* VALORES R$ — o subtexto de cada card é o que distingue o card PORTE do
              campo de entrada PORTE (H4) */}
          <h2 className="secao">
            <span className="material-symbols-outlined">payments</span>
            VALORES R$
          </h2>
          <div className="cards">
            <div className="card animated-card" style={estiloCard}>
              <h3>PORTE</h3>
              <p>{formatarMoedaBR(resultado.honorario)}</p>
              <p style={{ fontSize: 12, fontWeight: 400, opacity: 0.7 }}>
                porte {texto(resultado.porte)} × fração {numeroBR(resultado.fracao)}
              </p>
            </div>
            <div className="card animated-card" style={estiloCard}>
              <h3>UCO</h3>
              <p>{formatarMoedaBR(resultado.custoOperacional)}</p>
              <p style={{ fontSize: 12, fontWeight: 400, opacity: 0.7 }}>
                {numeroBR(resultado.uco)} UCO
              </p>
            </div>
            <div className="card animated-card" style={estiloCard}>
              <h3>FILME</h3>
              <p>{formatarMoedaBR(resultado.filme)}</p>
              <p style={{ fontSize: 12, fontWeight: 400, opacity: 0.7 }}>
                {numeroBR(resultado.filmes)} m² × {formatarMoedaBR(valorFilmeM2)}
              </p>
            </div>
            <div className="card animated-card" style={estiloCard}>
              <h3>NÚMERO DE AUXILIARES</h3>
              <p>{formatarMoedaBR(resultado.totalAuxiliares)}</p>
              <p style={{ fontSize: 12, fontWeight: 400, opacity: 0.7 }}>
                {resultado.numAux ? `${resultado.numAux} auxiliar(es)` : "sem auxiliar"}
              </p>
            </div>
            <div className="card animated-card" style={estiloCard}>
              <h3>ANESTESISTA</h3>
              <p>{formatarMoedaBR(resultado.anestesista)}</p>
              <p style={{ fontSize: 12, fontWeight: 400, opacity: 0.7 }}>
                porte anestésico {texto(resultado.porteAnest)}
              </p>
            </div>
            <div className="card animated-card card-total" style={estiloCard}>
              <h3>TOTAL GERAL</h3>
              <p>{formatarMoedaBR(resultado.totalGeral)}</p>
              <p style={{ fontSize: 12, fontWeight: 400, opacity: 0.7 }}>
                procedimento {formatarMoedaBR(resultado.subtotal)}
              </p>
            </div>
          </div>

          {resultado.filme > 0 && (
            <div className="aviso" style={estiloCard}>
              <span className="material-symbols-outlined">info</span>
              <span>
                A planilha original não somava o filme: a fórmula do painel apontava para
                uma célula vazia, então este item saía sempre R$&nbsp;0,00. Aqui ele é
                calculado com R$&nbsp;{numeroBR(valorFilmeM2, 2)}/m², o mesmo valor usado
                na coluna FILME_R$ da base. Para reproduzir o comportamento antigo, zere
                o campo <strong>FILME (M²) (K4)</strong> em <strong>Parâmetros</strong>.
              </span>
            </div>
          )}

          {/* PARÂMETROS — mesma ordem e nomes do bloco N3:N8 do painel */}
          <h2 className="secao">
            <span className="material-symbols-outlined">description</span>
            PARÂMETROS
          </h2>
          <dl className="grade-tecnica">
            {[
              ["FRAÇÃO", numeroBR(resultado.fracao)],
              ["PORTE", texto(resultado.porte)],
              ["UCO", numeroBR(resultado.uco)],
              ["FILME (M²)", numeroBR(resultado.filmes)],
              ["AUXILIARES", texto(resultado.numAux)],
              ["PORTE ANESTÉSICO", texto(resultado.porteAnest)],
              ["ROL ANS", texto(resultado.rol)],
              ["TUSS", texto(resultado.tuss)],
              ["DUT", texto(resultado.dut)],
            ].map(([rotulo, v]) => (
              <div key={rotulo} style={estiloCard}>
                <dt>{rotulo}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          {/* AUXILIARES */}
          {resultado.totalAuxiliares > 0 && (
            <>
              <h2 className="secao">
                <span className="material-symbols-outlined">group</span>
                NÚMERO DE AUXILIARES
              </h2>
              <div className="tabela-container" style={estiloCard}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ color: cores.texto }}>AUXILIAR</th>
                      <th style={{ color: cores.texto }}>% DO PORTE</th>
                      <th style={{ color: cores.texto }}>VALOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.auxiliares.map((v, i) =>
                      v > 0 ? (
                        <tr key={i}>
                          <td style={{ color: cores.texto }}>{i + 1}º Aux</td>
                          <td style={{ color: cores.texto }}>{i === 0 ? "30%" : "20%"}</td>
                          <td className="num" style={{ color: cores.texto }}>
                            {formatarMoedaBR(v)}
                          </td>
                        </tr>
                      ) : null,
                    )}
                    <tr className="destaque-linha">
                      <td style={{ color: cores.texto }} colSpan={2}>
                        TOTAL
                      </td>
                      <td className="num" style={{ color: cores.texto }}>
                        {formatarMoedaBR(resultado.totalAuxiliares)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* EVOLUÇÃO */}
          <h2 className="secao">
            <span className="material-symbols-outlined">show_chart</span>
            Evolução do valor entre as edições
          </h2>
          <div className="card animated-card" style={{ ...estiloCard, width: "100%" }}>
            <p style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginBottom: 12 }}>
              Cada edição cotada no seu próprio ano.
            </p>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={serie} margin={{ top: 5, right: 16, bottom: 5, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.25)" />
                  <XAxis dataKey="edicao" stroke={cores.texto} tick={{ fontSize: 11 }} />
                  <YAxis
                    stroke={cores.texto}
                    tick={{ fontSize: 11 }}
                    width={80}
                    tickFormatter={(v) => formatarMoedaBR(v)}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12 }}
                    formatter={(v) => [formatarMoedaBR(v), "TOTAL GERAL"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={accent}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    connectNulls
                    name="TOTAL GERAL"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* COMPARATIVO */}
          <h2 className="secao">
            <span className="material-symbols-outlined">compare_arrows</span>
            PARÂMETROS EM TODAS VERSÕES DE CBHPM
          </h2>
          <div className="tabela-container" style={estiloCard}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {[
                      "ANO VERSÃO",
                      "PORTE",
                      "FRAÇÃO",
                      "UCO",
                      "FILME (M²)",
                      "AUXILIARES",
                      "PORTE ANESTÉSICO",
                      "PORTE R$",
                      "TOTAL GERAL",
                    ].map((h) => (
                      <th key={h} style={{ color: cores.texto }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparativo.map((c) => (
                    <tr
                      key={c.edicao}
                      className={c.edicao === edicao ? "destaque-linha" : ""}
                      style={
                        c.edicao === edicao
                          ? { background: "rgba(128,128,128,0.14)" }
                          : undefined
                      }
                    >
                      <td style={{ color: cores.texto }}>{c.rotulo}</td>
                      {c.encontrado ? (
                        <>
                          <td style={{ color: cores.texto }}>{texto(c.porte)}</td>
                          <td className="num" style={{ color: cores.texto }}>
                            {numeroBR(c.fracao)}
                          </td>
                          <td className="num" style={{ color: cores.texto }}>
                            {numeroBR(c.uco)}
                          </td>
                          <td className="num" style={{ color: cores.texto }}>
                            {numeroBR(c.filmes)}
                          </td>
                          <td style={{ color: cores.texto }}>{texto(c.numAux)}</td>
                          <td style={{ color: cores.texto }}>{texto(c.porteAnest)}</td>
                          <td className="num" style={{ color: cores.texto }}>
                            {formatarMoedaBR(c.honorario)}
                          </td>
                          <td className="num" style={{ color: cores.texto }}>
                            {formatarMoedaBR(c.totalGeral)}
                          </td>
                        </>
                      ) : (
                        <td
                          colSpan={8}
                          style={{ color: cores.texto, opacity: 0.55, textAlign: "left" }}
                        >
                          código não consta nesta edição
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
