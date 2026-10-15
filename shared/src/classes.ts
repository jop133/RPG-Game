// Classes jogáveis (GDD: mago, bárbaro, povo fera, elfo). Por enquanto a classe só fica registrada no personagem;
// habilidades e números próprios entram no passo 10 (Classes e vilas).
export const CLASS_IDS = ["mago", "elfo", "barbaro", "homem_fera"] as const;
export type ClassId = (typeof CLASS_IDS)[number];

// Erro da entrada quando o personagem ainda não tem classe (primeiro da linhagem ou herdeiro):
// o cliente mostra a ficha de classe e entra de novo mandando a escolhida.
export const CLASS_REQUIRED_CODE = 428;

// Vem do cliente: só aceita um dos ids de CLASS_IDS.
export function parseClassId(raw: unknown): ClassId | undefined {
  return CLASS_IDS.find((id) => id === raw);
}
