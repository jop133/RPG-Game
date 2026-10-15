import { StateView } from "@colyseus/schema";
import { CloseCode, Room, type Client } from "colyseus";
import {
  HUNGER_MAX,
  INVENTORY_SLOTS,
  NO_INPUT,
  PLAYER_SIZE,
  TICK_RATE,
  isAtPortal,
  levelForXp,
  moveWithCollision,
  movementDelta,
  parseMoveInput,
  parseSlotIndex,
  pickSpawnPoint,
  playerStats,
  useSlot,
  type Inventory,
  type ItemId,
  type MoveInput,
} from "shared";
import type { CharacterRecord } from "./db";
import { loadCity } from "./level";
import { admit, release } from "./presence";
import { CityPlayerState, CityState, ItemSlotState, OWNER_TAG } from "./state";
import { store } from "./store";
import { updateVisibility } from "./views";

const city = loadCity(new URL("../../assets/maps/city.json", import.meta.url));

// A cidade: uma sala para todos, segura (GDD). Anda, usa itens e entra no portal; sem combate, fome nem mobs.
// O que muda aqui (itens usados, essências) vai para o banco na hora: na cidade não há run para desfazer.
export class CityRoom extends Room<{ state: CityState }> {
  state = new CityState();

  private moveInputs = new Map<string, MoveInput>();
  private characters = new Map<string, CharacterRecord>();
  // Velocidade de cada um, que vem das essências equipadas.
  private speeds = new Map<string, number>();
  private essences = new Map<string, ItemId[]>();
  // A verdade do inventário. CityPlayerState.inventory só espelha isto para o dono ver.
  private inventories = new Map<string, Inventory>();

  onCreate() {
    this.onMessage("input", (client, message) => {
      this.moveInputs.set(client.sessionId, parseMoveInput(message));
    });
    this.onMessage("enterPortal", (client) => this.handlePortal(client));
    this.onMessage("use", (client, message) => this.handleUse(client.sessionId, message));
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  onAuth(_client: Client, options: unknown): CharacterRecord {
    return admit(options);
  }

  onJoin(client: Client) {
    const record = client.auth as CharacterRecord;
    const xp = store.xp(record.characterId);
    const essences = store.essences(record.characterId);
    this.characters.set(client.sessionId, record);
    this.essences.set(client.sessionId, essences);
    this.speeds.set(client.sessionId, playerStats(essences).speed);
    this.moveInputs.set(client.sessionId, NO_INPUT);
    const player = new CityPlayerState({
      name: record.name,
      classId: record.classId ?? "",
      ...pickSpawnPoint(city.spawnPoints, Math.random()),
      xp,
      level: levelForXp(xp),
    });
    for (const essence of essences) player.essences.push(essence);
    for (let i = 0; i < INVENTORY_SLOTS; i++) player.inventory.push(new ItemSlotState({ item: "", count: 0 }));
    this.setInventory(client.sessionId, player, store.inventory(record.characterId));
    this.state.players.set(client.sessionId, player);
    client.view = new StateView();
    client.view.add(player, OWNER_TAG);
  }

  // Sem onDrop: a cidade é segura, então quem cai simplesmente sai (e volta pelo nome).
  onLeave(client: Client) {
    this.removePlayer(client.sessionId);
  }

  private removePlayer(sessionId: string) {
    this.state.players.delete(sessionId);
    this.moveInputs.delete(sessionId);
    this.speeds.delete(sessionId);
    this.essences.delete(sessionId);
    this.inventories.delete(sessionId);
    const record = this.characters.get(sessionId);
    if (record) release(record);
    this.characters.delete(sessionId);
  }

  private setInventory(sessionId: string, player: CityPlayerState, inventory: Inventory) {
    this.inventories.set(sessionId, inventory);
    inventory.forEach((slot, i) => {
      const view = player.inventory[i];
      if (!view) return;
      view.item = slot?.item ?? "";
      view.count = slot?.count ?? 0;
    });
  }

  // Tecla do slot, como no labirinto. Sem fome na cidade: comida é gasta sem efeito (escolha do dono do projeto).
  private handleUse(sessionId: string, message: unknown) {
    const slot = parseSlotIndex(message);
    const player = this.state.players.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    const record = this.characters.get(sessionId);
    if (slot === undefined || !player || !inventory || !record) return;
    const essences = this.essences.get(sessionId) ?? [];
    const outcome = useSlot(inventory, slot, { hunger: HUNGER_MAX, essences, essenceSlots: player.level });
    if (outcome.kind === "noEssenceSlot") {
      const text = `Sem slot de essência livre (nível ${player.level} = ${player.level} slots).`;
      this.clients.getById(sessionId)?.send("notice", { text });
      return;
    }
    if (outcome.kind !== "used") return;
    this.setInventory(sessionId, player, outcome.inventory);
    store.setInventory(record.characterId, outcome.inventory);
    if (outcome.essences.length === essences.length) return;
    store.setEssences(record.characterId, outcome.essences);
    this.essences.set(sessionId, outcome.essences);
    this.speeds.set(sessionId, playerStats(outcome.essences).speed);
    player.essences.push(outcome.essences[outcome.essences.length - 1] as ItemId);
  }

  // E dentro do portal: sai da cidade. O cliente entra numa run do labirinto em seguida.
  // Libera o personagem antes de avisar, para a entrada no labirinto não ser recusada como "já está no jogo".
  private handlePortal(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !isAtPortal(player, city.portals)) return;
    this.removePlayer(client.sessionId);
    client.send("toLabyrinth");
    client.leave(CloseCode.CONSENTED);
  }

  private tick(dtMs: number) {
    this.state.players.forEach((player, sessionId) => {
      const delta = movementDelta(this.moveInputs.get(sessionId) ?? NO_INPUT, dtMs, this.speeds.get(sessionId));
      const next = moveWithCollision(city.grid, player, delta, PLAYER_SIZE / 2);
      player.x = next.x;
      player.y = next.y;
    });
    for (const client of this.clients) {
      const view = client.view;
      const self = this.state.players.get(client.sessionId);
      if (!view || !self) continue;
      this.state.players.forEach((other, sessionId) => {
        if (sessionId !== client.sessionId) updateVisibility(view, self, other);
      });
    }
  }
}
