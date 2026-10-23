import { CLASS_IDS, CLASS_NAMES, DEV, IRON_GEAR, ITEMS, teleportRoom, type ClassId, type DevRoom, type DevShop, type DevTeleport, type ItemId } from "shared";
import "./devPanel.css";

// Ferramentas de dev no cliente: o painel (F2, ou já aberto com ?dev=1 ou ?testRoom=1) e o window.__DEV__, a mesma
// coisa por código (testes automatizados no console). Só desenho e pedidos: quem executa é o servidor, e só com
// DEV_TOOLS=1 (sem isso, o painel diz que está desligado). Ver CLAUDE.md.

// O que o painel precisa do jogo (main.ts).
export interface DevBridge {
  // Em que sala o jogador está agora (undefined: nenhuma, ex.: tela de fim).
  where(): DevRoom | undefined;
  // Comando para a sala atual ("dev_command").
  send(command: Record<string, unknown>): void;
  // Troca de sala e vai ao destino (resolve quando a cena nova aparece).
  goTo(target: DevTeleport): Promise<void>;
  // Vai à loja na cidade e abre a janela dela.
  openShop(shop: DevShop): Promise<void>;
  // Direção do jogador para o mouse (spawn "à frente"), se houver mouse no jogo.
  aim(): number | undefined;
  notice(text: string): void;
}

const MOBS = [
  ["goblin", "Goblin"],
  ["slime", "Slime"],
  ["lobo", "Lobo"],
  ["gnomo", "Gnomo"],
  ["dummy", "Boneco de Treino"],
] as const;
// Minibosses (no labirinto nascem sozinhos no meio da zona; aqui, à frente, como os outros mobs).
const BOSSES = [
  ["krag", "Krag, o Carrasco"],
  ["rei_slime", "Rei Slime Abissal"],
] as const;
// Painel recolhido (só o título): lembrado neste navegador.
const COLLAPSED_KEY = "rpg-extracao:devPanelCollapsed";
const PLACES: readonly [DevTeleport, string][] = [
  ["test_room", "Sala de Testes"],
  ["hub", "Praça (cidade)"],
  ["goblin_zone", "Zona Goblin"],
  ["slime_zone", "Zona Slime"],
  ["wolf_zone", "Zona Lobo"],
  ["gnome_zone", "Zona Gnomo"],
  ["portal", "Portal de saída"],
];
const SHOPS: readonly [DevShop, string][] = [
  ["blacksmith", "Ferreiro"],
  ["guild", "Guilda"],
  ["food", "Comida"],
  ["stash", "Baú"],
];
const ZONES = [
  ["none", "Nenhum"],
  ["goblin", "Breu (goblin)"],
  ["slime", "Miasma (slime)"],
  ["wolf", "Frio (lobo)"],
  ["gnome", "Radiação (gnomo)"],
] as const;
const SINGLE_ITEMS: readonly ItemId[] = ["espada_ferro", "cajado_arcano", "besta"];
// Drops dos monstros: o Cristal e as 4 essências.
const DROP_ITEMS: readonly ItemId[] = ["cristal_magico", "essencia_goblin", "essencia_slime", "essencia_lobo", "essencia_gnomo"];
const LOCAL_SETTLE_MS = 250;

export class DevPanel {
  private readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private available: DevRoom | undefined;
  private god = false;
  private mobAi = true;
  private spawnStill = false;
  private spawnLow = false;

  constructor(private readonly bridge: DevBridge) {
    this.root = div("dev-panel", document.body);
    this.root.hidden = true;
    // Título com os botões de recolher (só o título fica) e de mostrar o painel inteiro de novo.
    const head = div("dev-head", this.root);
    div("dev-head-title", head).textContent = "Sala de Testes · F2";
    this.button(head, "Esconder", () => this.setCollapsed(true), "dev-small dev-hide");
    this.button(head, "Mostrar inteira", () => this.setCollapsed(false), "dev-small dev-primary dev-show");
    this.status = div("dev-status", this.root);
    this.build();
    window.addEventListener("keydown", (e) => {
      if (e.code !== "F2") return;
      e.preventDefault();
      this.toggle();
    });
    const params = new URLSearchParams(window.location.search);
    if (params.has("dev") || params.has("testRoom")) this.root.hidden = false;
    this.setCollapsed(readCollapsed());
    this.refresh();
  }

  toggle() {
    this.root.hidden = !this.root.hidden;
  }

  // Recolhido: só a barra do título, com o botão de mostrar tudo; o resto do painel some.
  setCollapsed(collapsed: boolean) {
    this.root.classList.toggle("dev-collapsed", collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // Sem armazenamento (aba privada): só não lembra.
    }
  }

  // A sala nova avisou que as ferramentas estão ligadas: o God Mode e a IA escolhidos continuam valendo nela.
  setAvailable(room: DevRoom) {
    this.available = room;
    if (room !== "city") {
      if (this.god) this.bridge.send({ command: "set_god_mode", enabled: true });
      if (!this.mobAi) this.bridge.send({ command: "set_mob_ai", enabled: false });
    }
    this.refresh();
  }

  // Saiu da sala (troca de sala, fim de run): até a próxima avisar, nada a fazer.
  setUnavailable() {
    this.available = undefined;
    this.refresh();
  }

  // ------------------------------------------------------------ ações (as mesmas do window.__DEV__)

  setGodMode(enabled: boolean) {
    this.god = enabled;
    this.command({ command: "set_god_mode", enabled });
    this.refresh();
  }

  setMobAi(enabled: boolean) {
    this.mobAi = enabled;
    this.command({ command: "set_mob_ai", enabled });
    this.refresh();
  }

  setClass(characterClass: ClassId) {
    this.command({ command: "set_class", characterClass });
  }

  giveItem(item: ItemId, autoEquip = false, count = 1) {
    this.command({ command: "give_item", item, equip: autoEquip, count });
  }

  giveAllGear() {
    this.command({ command: "give_all_gear" });
  }

  clearBag() {
    this.command({ command: "clear_bag" });
  }

  addGold(amount = DEV.gold) {
    this.command({ command: "add_gold", amount });
  }

  heal() {
    this.command({ command: "heal" });
  }

  spawnMob(type: string, options: { count?: number; aiEnabled?: boolean; lowHp?: boolean } = {}) {
    const angle = this.bridge.aim();
    this.command({
      command: "spawn_mob",
      mob: type,
      count: options.count ?? 1,
      aiEnabled: options.aiEnabled ?? !this.spawnStill,
      lowHp: options.lowHp ?? this.spawnLow,
      ...(angle === undefined ? {} : { angle }),
    });
  }

  clearMobs() {
    this.command({ command: "clear_mobs" });
  }

  // 3 Cristais e 1 Essência caindo ao lado do jogador (o espaçamento e a animação dos drops).
  testDrops() {
    this.command({ command: "test_drops" });
  }

  setZoneEffect(zone: string) {
    this.command({ command: "force_zone_effect", effect: zone });
  }

  // Na mesma sala, o servidor leva na hora; em outra, troca de sala e entra já no destino.
  async teleport(target: DevTeleport): Promise<void> {
    const here = this.bridge.where();
    if (here && teleportRoom(target) === here && this.available) {
      this.bridge.send({ command: "teleport_to", target });
      await wait(LOCAL_SETTLE_MS);
      return;
    }
    await this.bridge.goTo(target);
  }

  openShop(shop: DevShop): Promise<void> {
    return this.bridge.openShop(shop);
  }

  private command(command: Record<string, unknown>) {
    if (!this.available) {
      this.bridge.notice("Ferramentas de dev desligadas (servidor sem DEV_TOOLS=1) ou trocando de sala.");
      return;
    }
    this.bridge.send(command);
  }

  // ------------------------------------------------------------ desenho

  private refresh() {
    const where = { city: "cidade", game: "labirinto", sandbox: "Sala de Testes" } as const;
    this.status.textContent = this.available ? `Ligado · ${where[this.available]}` : "Desligado (servidor sem DEV_TOOLS=1?)";
    this.root.classList.toggle("dev-off", !this.available);
    this.root.querySelectorAll<HTMLInputElement>("input[data-flag]").forEach((box) => {
      const flag = box.dataset.flag as "god" | "mobAi" | "spawnStill" | "spawnLow";
      box.checked = this[flag];
    });
  }

  private build() {
    const quick = this.section("Rápido");
    this.toggleBox(quick, "god", "God Mode (imortal, Mana infinita)", (on) => this.setGodMode(on));
    this.toggleBox(quick, "mobAi", "IA dos mobs ativa", (on) => this.setMobAi(on));
    const row = div("dev-row", quick);
    this.button(row, "Ir para a Sala de Testes", () => void this.teleport("test_room"), "dev-primary");
    this.button(row, "Curar tudo", () => this.heal());

    const classes = div("dev-row", this.section("Classe"));
    for (const id of CLASS_IDS) this.button(classes, CLASS_NAMES[id], () => this.setClass(id));

    const items = div("dev-row", this.section("Itens"));
    for (const id of SINGLE_ITEMS) this.button(items, ITEMS[id].name, () => this.giveItem(id, true));
    this.button(items, "Ferro completo", () => this.giveAllGear());
    for (const id of IRON_GEAR) this.button(items, ITEMS[id].name, () => this.giveItem(id, true), "dev-small");
    this.button(items, "Rações x5", () => this.giveItem("racao", false, 5));
    this.button(items, `+${DEV.gold} Ouro`, () => this.addGold());
    this.button(items, "Limpar mochila", () => this.clearBag(), "dev-danger");

    const drops = div("dev-row", this.section("Drops dos monstros"));
    for (const id of DROP_ITEMS) this.button(drops, ITEMS[id].name, () => this.giveItem(id, false, id === "cristal_magico" ? 5 : 1), "dev-small");
    this.button(drops, "Dropar Cristais + Essência no Chão", () => this.testDrops(), "dev-primary");

    const mobs = this.section("Mobs (3 tiles à frente, rumo ao mouse)");
    const spawn = div("dev-row", mobs);
    for (const [kind, label] of MOBS) this.button(spawn, `+1 ${label}`, () => this.spawnMob(kind));
    this.button(spawn, "Limpar mobs", () => this.clearMobs(), "dev-danger");
    const bosses = div("dev-row", mobs);
    for (const [kind, label] of BOSSES) this.button(bosses, `+1 ${label}`, () => this.spawnMob(kind), "dev-primary");
    this.toggleBox(mobs, "spawnStill", "Spawnar parado (IA desligada)", (on) => ((this.spawnStill = on), this.refresh()));
    this.toggleBox(mobs, "spawnLow", "Spawnar com pouca vida", (on) => ((this.spawnLow = on), this.refresh()));

    const travel = div("dev-row", this.section("Teleporte"));
    for (const [target, label] of PLACES) this.button(travel, label, () => void this.teleport(target));
    for (const [shop, label] of SHOPS) this.button(travel, `Loja: ${label}`, () => void this.openShop(shop), "dev-small");

    const zones = div("dev-row", this.section("Efeito de zona (onde você está)"));
    for (const [zone, label] of ZONES) this.button(zones, label, () => this.setZoneEffect(zone));
  }

  private section(title: string): HTMLDivElement {
    const box = div("dev-section", this.root);
    div("dev-title", box).textContent = title;
    return box;
  }

  private button(parent: HTMLElement, label: string, onClick: () => void, extra = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `dev-btn ${extra}`.trim();
    b.textContent = label;
    b.addEventListener("click", onClick);
    parent.append(b);
  }

  private toggleBox(parent: HTMLElement, flag: "god" | "mobAi" | "spawnStill" | "spawnLow", label: string, onChange: (on: boolean) => void) {
    const line = document.createElement("label");
    line.className = "dev-check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.flag = flag;
    box.addEventListener("change", () => onChange(box.checked));
    line.append(box, document.createTextNode(` ${label}`));
    parent.append(line);
  }
}

// window.__DEV__: as ações do painel por código (ver CLAUDE.md, "REGRA DE TESTE RÁPIDO").
export interface DevApi {
  enterTestRoom(): Promise<void>;
  setGodMode(enabled: boolean): void;
  setMobAi(enabled: boolean): void;
  setClass(cls: string): void;
  giveItem(itemId: string, autoEquip?: boolean, count?: number): void;
  giveAllGear(): void;
  clearBag(): void;
  addGold(amount: number): void;
  heal(): void;
  spawnMob(type: string, options?: { count?: number; aiEnabled?: boolean; lowHp?: boolean }): void;
  clearMobs(): void;
  testDrops(): void;
  teleport(target: string): Promise<void>;
  setZoneEffect(zone: string): void;
  openShop(shop: "blacksmith" | "guild" | "food" | "stash"): Promise<void>;
  togglePanel(): void;
}

export function installDevApi(panel: DevPanel): DevApi {
  const api: DevApi = {
    enterTestRoom: () => panel.teleport("test_room"),
    setGodMode: (enabled) => panel.setGodMode(enabled),
    setMobAi: (enabled) => panel.setMobAi(enabled),
    setClass: (cls) => panel.setClass(cls as ClassId),
    giveItem: (itemId, autoEquip, count) => panel.giveItem(itemId as ItemId, autoEquip, count),
    giveAllGear: () => panel.giveAllGear(),
    clearBag: () => panel.clearBag(),
    addGold: (amount) => panel.addGold(amount),
    heal: () => panel.heal(),
    spawnMob: (type, options) => panel.spawnMob(type, options),
    clearMobs: () => panel.clearMobs(),
    testDrops: () => panel.testDrops(),
    teleport: (target) => panel.teleport(target as DevTeleport),
    setZoneEffect: (zone) => panel.setZoneEffect(zone),
    openShop: (shop) => panel.openShop(shop),
    togglePanel: () => panel.toggle(),
  };
  (window as unknown as { __DEV__: DevApi }).__DEV__ = api;
  return api;
}

function div(className: string, parent: HTMLElement): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  parent.append(node);
  return node;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
