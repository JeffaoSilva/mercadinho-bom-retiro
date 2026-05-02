/**
 * Utilitários de normalização e correspondência flexível de texto para buscas.
 * Usado em todas as telas que filtram produtos por nome.
 *
 * Características:
 * - case-insensitive
 * - remove acentos
 * - colapsa espaços extras + trim
 * - trata plural simples (remove "s" final de palavras com 4+ letras)
 * - permite correspondência por palavras parciais e fora de ordem
 */

/** Normaliza texto: minúsculas, sem acentos, sem espaços duplicados. */
export function normalizarTextoBusca(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove plural simples ("s" final) de palavras com 4+ letras. */
function singularizarPalavra(palavra: string): string {
  if (palavra.length >= 4 && palavra.endsWith("s")) {
    return palavra.slice(0, -1);
  }
  return palavra;
}

/** Normaliza e quebra em tokens singularizados. */
export function tokensBusca(texto: string | null | undefined): string[] {
  const norm = normalizarTextoBusca(texto);
  if (!norm) return [];
  return norm.split(" ").filter(Boolean).map(singularizarPalavra);
}

/**
 * Verifica se `alvo` (ex: nome do produto) corresponde a `termo` (digitado pelo usuário).
 * Cada palavra do termo deve aparecer (substring) em alguma palavra normalizada do alvo.
 * Ordem das palavras não importa.
 */
export function correspondeBusca(
  alvo: string | null | undefined,
  termo: string | null | undefined
): boolean {
  const termos = tokensBusca(termo);
  if (termos.length === 0) return true;
  const alvoTokens = tokensBusca(alvo);
  if (alvoTokens.length === 0) return false;
  const alvoJoin = alvoTokens.join(" ");
  return termos.every(
    (t) => alvoJoin.includes(t) || alvoTokens.some((a) => a.includes(t))
  );
}

/**
 * Corresponde por nome OU por código de barras (substring exato sem normalização).
 * Use para inputs onde o usuário pode digitar nome ou código.
 */
export function correspondeNomeOuCodigo(
  nome: string | null | undefined,
  codigoBarras: string | null | undefined,
  termo: string | null | undefined
): boolean {
  const termoTrim = (termo ?? "").trim();
  if (!termoTrim) return true;
  if (codigoBarras && codigoBarras.includes(termoTrim)) return true;
  return correspondeBusca(nome, termoTrim);
}
