export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;

// Letras (com acento), números, espaço, hífen e sublinhado.
const ALLOWED = /^[\p{L}\p{N} _-]+$/u;

// Vem do cliente: o nome escolhido identifica a linhagem. Devolve o nome limpo, ou undefined se inválido.
export function parsePlayerName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) return undefined;
  return ALLOWED.test(name) ? name : undefined;
}
