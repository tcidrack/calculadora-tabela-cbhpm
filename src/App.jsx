import "./App.css";
import "./App.extra.css";
// logo empacotado em vez de puxado de maida.health, para o build offline funcionar
import logoMaida from "./assets/logo-maida.svg";
import { useEstadoPersistente } from "./hooks/useEstadoPersistente";
import Consulta from "./tabs/Consulta";
import TabelaCBHPM from "./tabs/TabelaCBHPM";

const ABAS = [
  { id: "consulta", label: "Consulta", icon: "calculate", Componente: Consulta },
  { id: "tabela", label: "Tabela CBHPM", icon: "table_rows", Componente: TabelaCBHPM },
];

export default function App() {
  const [tema, setTema] = useEstadoPersistente("tema", "claro");
  const [aba, setAba] = useEstadoPersistente("abaCBHPM", "consulta");

  const cores = {
    claro: { fundo: "#0070FF", card: "#E5F0FF", texto: "#000" },
    escuro: { fundo: "#111827", card: "#1E293B", texto: "#fff" },
  };

  function trocarTema() {
    setTema(tema === "claro" ? "escuro" : "claro");
  }

  const coresAtivas = cores[tema];
  const Ativa = (ABAS.find((a) => a.id === aba) || ABAS[0]).Componente;

  return (
    <div
      className={`container ${tema === "escuro" ? "tema-escuro" : "tema-claro"}`}
      style={{ backgroundColor: coresAtivas.fundo }}
    >
      {/* HEADER */}
      <div className="header">
        <div className="logo-area">
          <img src={logoMaida} alt="Logo Maida" />
          <h1>Calculadora CBHPM</h1>
        </div>

        <div className="acoes-header">
          <button className="btn-tema btn-tema-toggle" onClick={trocarTema}>
            <span className="material-symbols-outlined">
              {tema === "claro" ? "bedtime" : "brightness_7"}
            </span>
            {tema === "claro" ? "Escuro" : "Claro"}
          </button>
        </div>
      </div>

      {/* ABAS */}
      <div className="abas">
        {ABAS.map((a) => (
          <button
            key={a.id}
            className={`aba-btn ${aba === a.id ? "ativa" : ""}`}
            onClick={() => setAba(a.id)}
          >
            <span className="material-symbols-outlined" style={{ marginRight: 0 }}>
              {a.icon}
            </span>
            {a.label}
          </button>
        ))}
      </div>

      <Ativa tema={tema} cores={coresAtivas} />
    </div>
  );
}
