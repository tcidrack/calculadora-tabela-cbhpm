"""Extrai a base da CBHPM do .xlsx original para JSON.

Roda uma vez. A planilha tem abas de 40-63 MB, entao lemos o XML cru do zip com
iterparse em vez de openpyxl (que carrega tudo em memoria).

Uso:
    python scripts/extrair.py
"""

import html
import json
import os
import re
import xml.etree.ElementTree as ET
import zipfile

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(os.path.dirname(RAIZ), "CALCULO_CBHPM__V05022022-9q6ii2.xlsx")
SAIDA = os.path.join(RAIZ, "src", "data")

# Abas do workbook (xl/workbook.xml): PAINEL_CBHPM, Espelho, BD_CBHPM, Valores Portes_CBHPM
SHEET_BD = "xl/worksheets/sheet3.xml"
SHEET_PORTES = "xl/worksheets/sheet4.xml"

VALOR_FILME_M2 = 29.74  # constante em todas as edicoes; confirmado pela coluna FILME_R$ do BD


def ler_shared_strings(z):
    xml = z.read("xl/sharedStrings.xml").decode("utf-8")
    strings = []
    for m in re.finditer(r"<si>(.*?)</si>", xml, re.S):
        texto = "".join(re.findall(r"<t[^>]*>(.*?)</t>", m.group(1), re.S))
        strings.append(html.unescape(texto))
    return strings


def indice_coluna(ref):
    """'AB12' -> 27 (indice 0-based da coluna)."""
    letras = "".join(c for c in ref if c.isalpha())
    n = 0
    for c in letras:
        n = n * 26 + ord(c) - 64
    return n - 1


def limpar(v):
    """'-' e '' viram None; o resto vira string enxuta.

    A base tem sujeira: espaco nao-quebravel (\\xa0) no meio dos nomes e PORTE2
    gravado como '  1A'. O Excel nao tolera isso — o MATCH da coluna PORTE_R$
    devolve #N/A e o honorario sai zerado nessas linhas. Normalizar aqui corrige.
    """
    if v is None:
        return None
    v = v.replace("\xa0", " ").strip()
    return None if v in ("", "-") else v


def numero(v):
    """Converte para float aceitando virgula decimal.

    Parte de FRACAO esta gravada como texto ('0,10' em vez de 0.1). O Excel em
    pt-BR coage isso para numero na multiplicacao; float() do Python nao.
    """
    v = limpar(v)
    if v is None:
        return None
    v = v.replace(" ", "")
    if "," in v and "." not in v:
        v = v.replace(",", ".")
    try:
        return round(float(v), 6)
    except ValueError:
        return None


def ler_grade(z, sheet, strings):
    """Le uma aba pequena inteira para um dict {(linha, 'COL'): valor}."""
    xml = z.read(sheet).decode("utf-8")
    corpo = xml[xml.find("<sheetData>"):xml.find("</sheetData>")]
    grade = {}
    for linha in re.finditer(r'<row r="(\d+)"[^>]*>(.*?)</row>', corpo, re.S):
        n = int(linha.group(1))
        for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*)>(.*?)</c>', linha.group(2), re.S):
            col, attrs, interno = c.groups()
            tipo = re.search(r't="(\w+)"', attrs)
            tipo = tipo.group(1) if tipo else "n"
            v = re.search(r"<v[^>]*>(.*?)</v>", interno, re.S)
            valor = html.unescape(v.group(1)) if v else ""
            if tipo == "s" and valor:
                valor = strings[int(valor)]
            grade[(n, col)] = valor
    return grade


def extrair_tabelas(z, strings):
    """'Valores Portes_CBHPM': valores de porte, UCO e porte anestesico."""
    g = ler_grade(z, SHEET_PORTES, strings)

    # C97:D726 -> 630 pares "<anoCotacao><porte>" -> valor (42 portes x 15 anos)
    portes = {}
    anos = []
    for r in range(97, 727):
        chave = limpar(g.get((r, "C")))
        valor = numero(g.get((r, "D")))
        if chave and valor is not None:
            portes[chave] = valor
        ano = limpar(g.get((r, "A")))
        if ano and ano not in anos:
            anos.append(ano)

    # C729:D743 -> valor da UCO por ano
    uco = {}
    for r in range(729, 744):
        ano = limpar(g.get((r, "C")))
        valor = numero(g.get((r, "D")))
        if ano and valor is not None:
            uco[ano] = valor

    # C746:F865 -> "<anoCotacao><porteAnestesico>" -> valor (coluna F)
    anestesico = {}
    for r in range(746, 866):
        chave = limpar(g.get((r, "C")))
        if not chave:  # linhas 746-747 guardam a formula, nao o resultado
            ano, pa = limpar(g.get((r, "B"))), limpar(g.get((r, "A")))
            chave = (ano + pa) if ano and pa else None
        valor = numero(g.get((r, "F")))
        if chave and valor is not None:
            anestesico[chave] = valor

    return portes, uco, anestesico, anos


def extrair_procedimentos(z, strings):
    """BD_CBHPM -> [versao, codigo, nome, fracao, porte, uco, aux, pa, filmes, rol, tuss, dut].

    Descarta O:R (PORTE_R$, UCO_R$, FILME_R$, TOTAL_R$) - o motor JS recalcula.
    """
    colunas = [0, 1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13]  # A,B,D,E,G,H,I,J,K,L,M,N
    numericas = {4, 7, 10}  # FRACAO, Custo Operacional, Filmes (indices na origem)
    maiusculas = {6}  # PORTE2: duas linhas gravadas como '9c'; o MATCH do Excel
    #                   ignora caixa, o Map do JS nao

    registros = []
    with z.open(SHEET_BD) as f:
        primeira = True
        for _, el in ET.iterparse(f, events=("end",)):
            if el.tag != NS + "row":
                continue
            if primeira:  # cabecalho
                primeira = False
                el.clear()
                continue

            celulas = [""] * 18
            for c in el.findall(NS + "c"):
                i = indice_coluna(c.get("r"))
                if i >= 18:
                    continue
                tipo = c.get("t", "n")
                v = c.find(NS + "v")
                valor = v.text if v is not None and v.text else ""
                if tipo == "s" and valor:
                    valor = strings[int(valor)]
                celulas[i] = valor
            el.clear()

            if not limpar(celulas[0]) or not limpar(celulas[1]):
                continue  # duas linhas vazias no fim da tabela

            registro = []
            for i in colunas:
                if i in numericas:
                    registro.append(numero(celulas[i]))
                else:
                    v = limpar(celulas[i])
                    registro.append(v.upper() if v and i in maiusculas else v)
            registros.append(registro)

    return registros


def main():
    if not os.path.exists(XLSX):
        raise SystemExit(f"planilha nao encontrada: {XLSX}")
    os.makedirs(SAIDA, exist_ok=True)

    z = zipfile.ZipFile(XLSX)
    strings = ler_shared_strings(z)
    print(f"shared strings: {len(strings)}")

    portes, uco, anestesico, anos = extrair_tabelas(z, strings)
    print(f"portes: {len(portes)} | uco: {len(uco)} | anestesico: {len(anestesico)}")

    registros = extrair_procedimentos(z, strings)
    print(f"procedimentos: {len(registros)}")

    edicoes = []
    for r in registros:
        if r[0] not in edicoes:
            edicoes.append(r[0])
    print(f"edicoes: {edicoes}")

    # ordena os anos de cotacao na ordem cronologica das edicoes, nao alfabetica
    ordem = ["3_ED", "4_ED", "5_2008", "5_2009"]
    anos_cotacao = [a for a in ordem if a in anos] + sorted(a for a in anos if a not in ordem)
    print(f"anos de cotacao: {anos_cotacao}")

    tabelas = {
        "portes": portes,
        "uco": uco,
        "anestesico": anestesico,
        "edicoes": edicoes,
        "anosCotacao": anos_cotacao,
        "valorFilmeM2": VALOR_FILME_M2,
        "campos": [
            "versao", "codigo", "nome", "fracao", "porte", "uco",
            "numAux", "porteAnest", "filmes", "rol", "tuss", "dut",
        ],
    }

    caminho_tabelas = os.path.join(SAIDA, "tabelas.json")
    with open(caminho_tabelas, "w", encoding="utf-8") as f:
        json.dump(tabelas, f, ensure_ascii=False, separators=(",", ":"))

    caminho_proc = os.path.join(SAIDA, "procedimentos.json")
    with open(caminho_proc, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, separators=(",", ":"))

    for caminho in (caminho_tabelas, caminho_proc):
        print(f"{os.path.basename(caminho)}: {os.path.getsize(caminho) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
