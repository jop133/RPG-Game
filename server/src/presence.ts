import { ServerError } from "colyseus";
import { CLASS_REQUIRED_CODE, NAME_MAX_LENGTH, NAME_MIN_LENGTH, parseClassId, parsePlayerName } from "shared";
import type { CharacterRecord } from "./db";
import { store } from "./store";

// Personagens dentro de alguma sala agora (cidade ou labirinto; conectados ou esperando reconexão), neste processo.
// Impede o mesmo personagem de estar em dois lugares (ex.: o mesmo nome em duas abas).
const charactersInside = new Set<number>();

// Porta de entrada de toda sala: valida o nome e acha (ou cria) o personagem. Recusa quem já está em alguma sala.
// Personagem sem classe (novo) só entra mandando a classe escolhida na ficha; sem ela, a recusa tem
// CLASS_REQUIRED_CODE e o cliente mostra a ficha.
export function admit(options: unknown): CharacterRecord {
  const raw = options as { name?: unknown; classId?: unknown } | undefined;
  const name = parsePlayerName(raw?.name);
  if (!name) {
    throw new ServerError(400, `Nome inválido: use de ${NAME_MIN_LENGTH} a ${NAME_MAX_LENGTH} letras, números, espaço, - ou _.`);
  }
  const record = store.enter(name);
  if (charactersInside.has(record.characterId)) {
    throw new ServerError(409, `${record.name} já está no jogo.`);
  }
  if (!record.classId) {
    const classId = parseClassId(raw?.classId);
    if (!classId) throw new ServerError(CLASS_REQUIRED_CODE, "Escolha a classe do seu personagem.");
    store.setClass(record.characterId, classId);
    record.classId = classId;
  }
  charactersInside.add(record.characterId);
  return record;
}

// Saiu da sala (de qualquer jeito): libera o personagem para entrar em outra.
export function release(record: CharacterRecord) {
  charactersInside.delete(record.characterId);
}
