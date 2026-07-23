import { useCallback, useRef, useState } from "react";

/**
 * `useState` que sobrevive à troca de aba e ao recarregar a página.
 *
 * Trocar de aba desmonta o componente e o React descarta o `useState` dele — era assim
 * que o código pesquisado voltava ao padrão. Guardando no `localStorage`, o valor volta
 * na remontagem.
 *
 * Todo acesso ao storage é protegido: o `CBHPM-offline.html` roda por `file://`, onde o
 * navegador pode recusar o `localStorage`. Sem o try/catch a exceção sobe e a página
 * inteira fica em branco — falhar em lembrar é aceitável, falhar em abrir não é.
 *
 * @param {string} chave  identificador no storage, ex. "cbhpm.consulta.codigo"
 * @param {*} inicial     valor usado quando não há nada guardado
 * @returns {[*, Function]} mesmo par de `useState`
 */
export function useEstadoPersistente(chave, inicial) {
  const [valor, setValorEmMemoria] = useState(() => {
    let bruto = null;
    try {
      bruto = localStorage.getItem(chave);
    } catch {
      return inicial; // storage bloqueado
    }
    if (bruto === null) return inicial;
    try {
      return JSON.parse(bruto);
    } catch {
      // gravado por uma versão anterior, antes do JSON (ex.: tema como "escuro" cru)
      return bruto;
    }
  });

  // o setter precisa ser estável e enxergar o valor atual sem entrar nas dependências
  const valorRef = useRef(valor);
  valorRef.current = valor;

  const setValor = useCallback(
    (novo) => {
      const resolvido = typeof novo === "function" ? novo(valorRef.current) : novo;
      setValorEmMemoria(resolvido);
      try {
        localStorage.setItem(chave, JSON.stringify(resolvido));
      } catch {
        // sem storage o app segue normalmente, só não lembra na próxima sessão
      }
    },
    [chave],
  );

  return [valor, setValor];
}
