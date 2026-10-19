import { StateView, type ArraySchema } from "@colyseus/schema";
import { CloseCode, Room, type Client } from "colyseus";
import {
  HUNGER_MAX,
  INVENTORY_SLOTS,
  ITEMS,
  NO_INPUT,
  PLAYER_SIZE,
  STASH_SLOTS,
  TICK_RATE,
  STATION_FOR,
  buyItems,
  deposit,
  doorDestination,
  interactionAt,
  isAtPortal,
  levelForXp,
  moveWithCollision,
  movementDelta,
  parseMoveInput,
  parseSlotIndex,
  parseTrade,
  pickSpawnPoint,
  playerStats,
  sellItems,
  useSlot,
  withdraw,
  type StationId,
  type Equipment,
  type Inventory,
  type ItemId,
  type MoveInput,
  type Stash,
  type TradeOutcome,
} from "shared";
import type { CharacterRecord } from "./db";
import { applyGearAction, isEquippableSlot, type GearAction } from "./gear";
import { loadCity } from "./level";
import { admit, release } from "./presence";
import { CityPlayerState, CityState, ItemSlotState, OWNER_TAG } from "./state";
import { store } from "./store";
import { updateVisibility } from "./views";

const city = loadCity(new URL("../../assets/maps/city.json", import.meta.url));

// O que a linhagem tem na cidade: a bolsa de moedas e o baú. A verdade fica aqui; o estado só espelha para o dono.
interface Lineage {
  coins: number;
  stash: Stash;
}

// O que mudou numa venda, compra ou mexida no baú. Vai inteiro para o banco, numa transação.
interface CityChange {
  inventory: Inventory;
  coins?: number;
  stash?: Stash;
}

// Quem pede uma troca, já conferido: está na sala e na porta do prédio certo.
interface Customer {
  player: CityPlayerState;
  record: CharacterRecord;
  inventory: Inventory;
  lineage: Lineage;
}

const REFUSALS: Record<Exclude<TradeOutcome["kind"], "done">, string> = {
  notForSale: "Isso não se negocia aqui.",
  notEnough: "Você não tem tudo isso na mochila.",
  noCoins: "Moedas insuficientes.",
  noSpace: "Mochila cheia.",
};

// A cidade: uma sala para todos, segura (GDD). Anda, usa itens, negocia nos prédios e entra no portal; sem combate,
// fome nem mobs. O que muda aqui (itens, moedas, baú) vai para o banco na hora: na cidade não há run para desfazer.
export class CityRoom extends Room<{ state: CityState }> {
  state = new CityState();

  private moveInputs = new Map<string, MoveInput>();
  private characters = new Map<string, CharacterRecord>();
  // Velocidade de cada um, que vem dos status (essências e equipamento).
  private speeds = new Map<string, number>();
  private essences = new Map<string, ItemId[]>();
  // A verdade do inventário. CityPlayerState.inventory só espelha isto para o dono ver.
  private inventories = new Map<string, Inventory>();
  // O que cada um tem equipado. CityPlayerState.weapon espelha a arma, para todos verem na mão.
  private equipment = new Map<string, Equipment>();
  private lineages = new Map<string, Lineage>();

  onCreate() {
    this.onMessage("input", (client, message) => {
      this.moveInputs.set(client.sessionId, parseMoveInput(message));
    });
    this.onMessage("enterPortal", (client) => this.handlePortal(client));
    this.onMessage("door", (client) => this.handleDoor(client.sessionId));
    this.onMessage("use", (client, message) => this.handleUse(client.sessionId, message));
    for (const action of ["move", "equip", "unequip"] as const) {
      this.onMessage(action, (client, message) => this.handleGear(client.sessionId, action, message));
    }
    this.onMessage("deposit", (client, message) => this.handleStash(client.sessionId, message, "deposit"));
    this.onMessage("withdraw", (client, message) => this.handleStash(client.sessionId, message, "withdraw"));
    this.onMessage("sell", (client, message) => this.handleTrade(client.sessionId, message, "sell"));
    this.onMessage("buy", (client, message) => this.handleTrade(client.sessionId, message, "buy"));
    this.setSimulationInterval((dtMs) => this.tick(dtMs), 1000 / TICK_RATE);
  }

  onAuth(_client: Client, options: unknown): CharacterRecord {
    return admit(options);
  }

  onJoin(client: Client) {
    const record = client.auth as CharacterRecord;
    const xp = store.xp(record.characterId);
    const essences = store.essences(record.characterId);
    const lineage = { coins: store.coins(record.lineageId), stash: store.stash(record.lineageId) };
    this.characters.set(client.sessionId, record);
    this.essences.set(client.sessionId, essences);
    this.moveInputs.set(client.sessionId, NO_INPUT);
    this.lineages.set(client.sessionId, lineage);
    const player = new CityPlayerState({
      name: record.name,
      classId: record.classId ?? "",
      weapon: "", // setEquipment, logo abaixo
      ...pickSpawnPoint(city.spawnPoints, Math.random()),
      xp,
      level: levelForXp(xp),
      coins: lineage.coins,
    });
    for (const essence of essences) player.essences.push(essence);
    for (const kind of store.bestiary(record.lineageId)) player.bestiary.push(kind);
    for (const kind of store.characterKills(record.characterId)) player.kills.push(kind);
    for (let i = 0; i < INVENTORY_SLOTS; i++) player.inventory.push(new ItemSlotState({ item: "", count: 0 }));
    for (let i = 0; i < STASH_SLOTS; i++) player.stash.push(new ItemSlotState({ item: "", count: 0 }));
    this.setInventory(client.sessionId, player, store.inventory(record.characterId));
    this.setEquipment(client.sessionId, player, store.equipment(record.characterId));
    mirror(player.stash, lineage.stash);
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
    this.equipment.delete(sessionId);
    this.lineages.delete(sessionId);
    const record = this.characters.get(sessionId);
    if (record) release(record);
    this.characters.delete(sessionId);
  }

  private setInventory(sessionId: string, player: CityPlayerState, inventory: Inventory) {
    this.inventories.set(sessionId, inventory);
    mirror(player.inventory, inventory);
  }

  private setEquipment(sessionId: string, player: CityPlayerState, equipment: Equipment) {
    this.equipment.set(sessionId, equipment);
    player.weapon = equipment.weapon ?? "";
    this.refreshSpeed(sessionId);
  }

  // A cidade só usa a Velocidade dos status (sem combate, fome nem escuridão).
  private refreshSpeed(sessionId: string) {
    this.speeds.set(sessionId, playerStats(this.essences.get(sessionId) ?? [], this.equipment.get(sessionId)).speed);
  }

  // Arrastar na mochila, equipar e desequipar: em qualquer lugar da cidade. Grava antes de mudar a memória, mochila e
  // equipamento juntos (como nas trocas).
  private handleGear(sessionId: string, action: GearAction, message: unknown) {
    const player = this.state.players.get(sessionId);
    const record = this.characters.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    const equipment = this.equipment.get(sessionId);
    if (!player || !record || !inventory || !equipment) return;
    const result = applyGearAction(action, message, { inventory, equipment });
    if (result.kind === "refused") this.notify(sessionId, result.notice);
    if (result.kind !== "changed") return;
    store.saveGear(record.characterId, result.gear.inventory, result.gear.equipment);
    this.setInventory(sessionId, player, result.gear.inventory);
    this.setEquipment(sessionId, player, result.gear.equipment);
  }

  // Tecla do slot, como no labirinto. Sem fome na cidade: comida é gasta sem efeito (escolha do dono do projeto).
  // Item equipável: usar é equipar.
  private handleUse(sessionId: string, message: unknown) {
    const bag = this.inventories.get(sessionId);
    if (bag && isEquippableSlot(bag, message)) {
      this.handleGear(sessionId, "equip", message);
      return;
    }
    const slot = parseSlotIndex(message);
    const player = this.state.players.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    const record = this.characters.get(sessionId);
    if (slot === undefined || !player || !inventory || !record) return;
    const essences = this.essences.get(sessionId) ?? [];
    const outcome = useSlot(inventory, slot, { hunger: HUNGER_MAX, essences, essenceSlots: player.level });
    if (outcome.kind === "noEssenceSlot") {
      this.notify(sessionId, `Sem slot de essência livre (nível ${player.level} = ${player.level} slots).`);
      return;
    }
    if (outcome.kind !== "used") return;
    this.setInventory(sessionId, player, outcome.inventory);
    store.setInventory(record.characterId, outcome.inventory);
    if (outcome.essences.length === essences.length) return;
    store.setEssences(record.characterId, outcome.essences);
    this.essences.set(sessionId, outcome.essences);
    this.refreshSpeed(sessionId);
    player.essences.push(outcome.essences[outcome.essences.length - 1] as ItemId);
  }

  // Estalagem: clicar num slot da mochila guarda a pilha no baú; num slot do baú, traz para a mochila.
  private handleStash(sessionId: string, message: unknown, direction: "deposit" | "withdraw") {
    const customer = this.customerAt(sessionId, STATION_FOR.stash);
    const slot = parseSlotIndex(message, direction === "deposit" ? INVENTORY_SLOTS : STASH_SLOTS);
    if (!customer || slot === undefined) return;
    const { inventory, lineage } = customer;
    const source = direction === "deposit" ? inventory : lineage.stash;
    if (!source[slot]) return;
    const moved = (direction === "deposit" ? deposit : withdraw)(inventory, lineage.stash, slot);
    if (!moved) {
      this.notify(sessionId, direction === "deposit" ? "O baú está cheio." : "Mochila cheia.");
      return;
    }
    this.apply(sessionId, customer, moved);
  }

  // Guilda vende (o Mercador compra o loot do jogador); Estalagem compra (a Taverna vende comida).
  private handleTrade(sessionId: string, message: unknown, side: "sell" | "buy") {
    const customer = this.customerAt(sessionId, side === "sell" ? STATION_FOR.sell : STATION_FOR.buy);
    const trade = parseTrade(message);
    if (!customer || !trade) return;
    const { inventory, lineage } = customer;
    const trader = side === "sell" ? sellItems : buyItems;
    const outcome = trader(inventory, lineage.coins, trade.item, trade.count);
    if (outcome.kind !== "done") {
      this.notify(sessionId, REFUSALS[outcome.kind]);
      return;
    }
    const amount = Math.abs(outcome.coins - lineage.coins);
    this.apply(sessionId, customer, { inventory: outcome.inventory, coins: outcome.coins });
    const verb = side === "sell" ? "Vendeu" : "Comprou";
    this.notify(sessionId, `${verb} ${trade.count}x ${ITEMS[trade.item].name} (${side === "sell" ? "+" : "-"}${amount} moedas)`);
  }

  // E numa porta: a da rua leva para dentro do prédio; a de dentro, de volta à rua. Quem decide se o jogador está
  // numa porta é o servidor (o cliente só pede). O mesmo vale para quem está do lado: só o jogador muda de lugar.
  private handleDoor(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const target = doorDestination(interactionAt(player, city.interactions), city.arrivals, city.streetDoors);
    if (!target) return;
    player.x = target.x;
    player.y = target.y;
  }

  // A janela aberta no cliente não conta (regra 1): quem negocia precisa estar no móvel certo agora (o balcão para
  // vender, o balcão de comida para comprar, o Baú da Linhagem para guardar e retirar).
  private customerAt(sessionId: string, station: StationId): Customer | undefined {
    const player = this.state.players.get(sessionId);
    const record = this.characters.get(sessionId);
    const inventory = this.inventories.get(sessionId);
    const lineage = this.lineages.get(sessionId);
    if (!player || !record || !inventory || !lineage) return undefined;
    if (interactionAt(player, city.interactions) !== station) return undefined;
    return { player, record, inventory, lineage };
  }

  // Grava primeiro: se o banco falhar, nada muda na memória nem na tela.
  private apply(sessionId: string, customer: Customer, change: CityChange) {
    store.saveCityChange(customer.record, change);
    const { player, lineage } = customer;
    this.setInventory(sessionId, player, change.inventory);
    if (change.coins !== undefined) {
      lineage.coins = change.coins;
      player.coins = change.coins;
    }
    if (change.stash !== undefined) {
      lineage.stash = change.stash;
      mirror(player.stash, change.stash);
    }
  }

  private notify(sessionId: string, text: string) {
    this.clients.getById(sessionId)?.send("notice", { text });
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

// Copia os slots (verdade do servidor) para o espelho que vai ao cliente. Vazio = item "" e count 0.
function mirror(view: ArraySchema<ItemSlotState>, slots: Inventory) {
  slots.forEach((slot, i) => {
    const target = view[i];
    if (!target) return;
    target.item = slot?.item ?? "";
    target.count = slot?.count ?? 0;
  });
}
