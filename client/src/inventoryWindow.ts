import { INVENTORY_SLOTS, ITEMS, LEVEL_XP, PLAYER_ATTACK, PLAYER_SPEED, playerStats, type ItemId } from "shared";
import layout from "../../assets/ui/hud/layout.json";
import {
  ART,
  EQUIP_NAMES,
  FRONT_SPRITES,
  ICONS,
  SlotView,
  el,
  essenceEffectText,
  frameName,
  image,
  place,
  rarityStyle,
  setText,
  size,
  type HudSlot,
  type Tooltip,
} from "./hudParts";

// Janela de inventário (I, Tab ou B). Painel de ferro e couro com três seções, de cima para baixo:
// 1. equipamento em volta do personagem, com o resumo de atributos; 2. altar das essências absorvidas;
// 3. a mochila inteira (12 slots). Só desenho: os números vêm do servidor ou das mesmas regras puras de shared.
// Posições em pixels de HUD, a partir do couro do painel (medido na arte: layout.leather).

export interface InventoryView {
  classId: string;
  level: number;
  xp: number;
  nextLevelXp?: number;
  maxHp: number;
  essences: readonly string[];
  coins: number;
  inventory: readonly (HudSlot | undefined)[];
}

const EQUIP = 40;
const ESSENCE = 28;
const BAG = 34;
const GAP = 4;
const BAG_COLUMNS = 6;
// Nível = número de slots de essência; o maior nível é o último limite de LEVEL_XP.
const MAX_ESSENCE_SLOTS = LEVEL_XP.length + 1;
const SOON = "Slot de Equipamento (em breve na Cidade)";
// Colunas do equipamento: esquerda de cima para baixo, depois a direita.
const EQUIP_LEFT = [
  ["equip_helm", EQUIP_NAMES.helm],
  ["equip_chest", EQUIP_NAMES.chest],
  ["equip_boots", EQUIP_NAMES.boots],
] as const;
const EQUIP_RIGHT = [
  ["equip_weapon", EQUIP_NAMES.weapon],
  ["equip_shield", EQUIP_NAMES.shield],
  ["equip_ring", EQUIP_NAMES.ring],
] as const;

interface EssenceSlot {
  frame: HTMLImageElement;
  icon: HTMLImageElement;
  lock: HTMLImageElement;
}

export class InventoryWindow {
  readonly root: HTMLDivElement;
  private readonly sprite: HTMLImageElement;
  private readonly stats: HTMLDivElement[] = [];
  private readonly essenceTitle: HTMLDivElement;
  private readonly essenceSlots: EssenceSlot[] = [];
  private readonly bagSlots: SlotView[] = [];
  private readonly coinText: HTMLSpanElement;
  private view?: InventoryView;
  private shownEssences = "";

  constructor(parent: HTMLElement, tooltip: Tooltip, onUse: (slot: number) => void) {
    this.root = el("div", "hud-window", parent);
    this.root.hidden = true;
    const panel = layout.inv_panel;
    const leather = layout.leather;
    size(this.root, panel.w, panel.h);
    image("inv_panel", "hud-abs", this.root);
    place(el("div", "hud-abs hud-window-title", this.root), 0, leather.y - 26, panel.w).textContent = "Inventário";
    // Logo abaixo do título: embaixo do painel, a barra rápida pode cobrir (ver hud.css).
    const keys = place(el("div", "hud-abs hud-window-footer", this.root), 0, leather.y - 11, panel.w);
    keys.textContent = "[I / Tab / B] ou [Esc] fecha";

    // 1. Equipamento em duas colunas, personagem no meio, atributos embaixo.
    const top = leather.y + 6;
    const left = leather.x + 4;
    const right = leather.x + leather.w - 4 - EQUIP;
    EQUIP_LEFT.forEach(([art, name], i) => this.equipSlot(tooltip, art, name, left, top + i * (EQUIP + GAP)));
    EQUIP_RIGHT.forEach(([art, name], i) => this.equipSlot(tooltip, art, name, right, top + i * (EQUIP + GAP)));
    const column = 3 * EQUIP + 2 * GAP;
    place(el("div", "hud-abs hud-pedestal", this.root), left + EQUIP + 6, top + column - 28, right - left - EQUIP - 12, 24);
    this.sprite = place(el("img", "hud-abs hud-character", this.root), leather.x + leather.w / 2 - 64, top, 128, 128);
    this.sprite.alt = "";
    this.sprite.draggable = false;
    for (let line = 0; line < 2; line++) {
      this.stats.push(place(el("div", "hud-abs hud-stats", this.root), leather.x, top + column + 4 + line * 11, leather.w));
    }

    // 2. Altar das essências: os slots que o nível abre, e os próximos trancados.
    const essenceTop = top + column + 30;
    this.essenceTitle = place(el("div", "hud-abs hud-section-title", this.root), leather.x, essenceTop, leather.w);
    const essenceWidth = MAX_ESSENCE_SLOTS * ESSENCE + (MAX_ESSENCE_SLOTS - 1) * GAP;
    for (let i = 0; i < MAX_ESSENCE_SLOTS; i++) {
      const x = leather.x + (leather.w - essenceWidth) / 2 + i * (ESSENCE + GAP);
      this.essenceSlots.push(this.essenceSlot(tooltip, i, Math.round(x), essenceTop + 13));
    }

    // 3. Mochila: os 12 slots do inventário, em 2 fileiras de 6, com as teclas.
    const bagTop = essenceTop + 13 + ESSENCE + 8;
    place(el("div", "hud-abs hud-section-title", this.root), leather.x, bagTop, leather.w).textContent = "Mochila";
    // Na mesma linha, à direita: a bolsa de moedas (da linhagem: o herdeiro herda).
    const purse = place(el("div", "hud-abs hud-window-purse", this.root), leather.x, bagTop - 1, leather.w - 6);
    image("icon_coin", "hud-coin", purse);
    this.coinText = el("span", "", purse);
    tooltip.attach(purse, () => ({ title: "Moedas da linhagem", lines: ["Ficam com a linhagem: o herdeiro herda.", "Ganhe vendendo loot na Guilda."] }));
    const bagWidth = BAG_COLUMNS * BAG + (BAG_COLUMNS - 1) * GAP;
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = new SlotView(this.root, i, onUse, tooltip, { frameSize: BAG, iconScale: 1, emptyFrame: true });
      const x = leather.x + (leather.w - bagWidth) / 2 + (i % BAG_COLUMNS) * (BAG + GAP);
      place(slot.root, Math.round(x), bagTop + 13 + Math.floor(i / BAG_COLUMNS) * (BAG + GAP));
      this.bagSlots.push(slot);
    }
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle() {
    this.root.hidden = !this.root.hidden;
  }

  close() {
    this.root.hidden = true;
  }

  update(view: InventoryView) {
    this.view = view;
    const sprite = FRONT_SPRITES.get(view.classId) ?? FRONT_SPRITES.get("mago") ?? "";
    if (this.sprite.getAttribute("src") !== sprite) this.sprite.src = sprite;
    const stats = playerStats(view.essences as ItemId[]);
    const speedBonus = Math.round((stats.speed / PLAYER_SPEED - 1) * 100);
    const xp = view.nextLevelXp === undefined ? `XP ${view.xp} (máximo)` : `XP ${view.xp} / ${view.nextLevelXp}`;
    setText(this.stats[0] as HTMLDivElement, `Vida Máx ${view.maxHp}  ·  Dano ${stats.damage}  ·  Velocidade ${Math.round(stats.speed)}${speedBonus ? ` (+${speedBonus}%)` : ""}`);
    setText(this.stats[1] as HTMLDivElement, `Nível ${view.level}  ·  ${xp}`);
    setText(this.essenceTitle, `Essências absorvidas  ${view.essences.length} / ${view.level}`);
    setText(this.coinText, String(view.coins));
    this.updateEssences(view);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = view.inventory[i];
      this.bagSlots[i]?.set(slot && slot.count > 0 ? slot : undefined);
    }
  }

  private updateEssences(view: InventoryView) {
    const key = `${view.level}:${view.essences.join(",")}`;
    if (key === this.shownEssences) return;
    this.shownEssences = key;
    this.essenceSlots.forEach((slot, i) => {
      const item = view.essences[i];
      const stats = item ? (ITEMS[item as ItemId] as (typeof ITEMS)[ItemId] | undefined) : undefined;
      const unlocked = i < view.level;
      slot.frame.src = ART.get(frameName(stats?.rarity ?? "common", ESSENCE)) ?? "";
      slot.frame.classList.toggle("hud-dim", !stats);
      slot.icon.hidden = !stats;
      if (item) slot.icon.src = ICONS.get(item) ?? "";
      slot.lock.hidden = unlocked;
    });
  }

  private equipSlot(tooltip: Tooltip, art: string, name: string, x: number, y: number) {
    const slot = place(image(art, "hud-abs hud-equip", this.root), x, y, EQUIP, EQUIP);
    if (art !== "equip_weapon") {
      tooltip.attach(slot, () => ({ title: name, lines: [SOON] }));
      return;
    }
    // Arma inicial: a única até a maestria de armas (passo 8). Dano com as essências; alcance e arco da arma.
    slot.classList.add("hud-equipped");
    const icon = place(image("icon_weapon", "hud-abs hud-weapon-icon", this.root), x + (EQUIP - 32) / 2, y + (EQUIP - 32) / 2, 32, 32);
    const describe = () => {
      const damage = playerStats((this.view?.essences ?? []) as ItemId[]).damage;
      return {
        title: "Arma inicial",
        subtitle: name,
        lines: [`Dano ${damage}  ·  Alcance ${PLAYER_ATTACK.range} px  ·  Arco ${PLAYER_ATTACK.arcDegrees}°`, "Golpe com o clique, na direção do mouse."],
      };
    };
    tooltip.attach(slot, describe);
    tooltip.attach(icon, describe);
  }

  private essenceSlot(tooltip: Tooltip, index: number, x: number, y: number): EssenceSlot {
    const box = place(el("div", "hud-abs hud-essence", this.root), x, y, ESSENCE, ESSENCE);
    const frame = place(image(frameName("common", ESSENCE), "hud-abs", box), 0, 0, ESSENCE, ESSENCE);
    const icon = place(el("img", "hud-abs", box), 6, 6, 16, 16);
    icon.alt = "";
    const lock = place(image("icon_lock", "hud-abs hud-lock", box), 6, 6, 16, 16);
    tooltip.attach(box, () => {
      const level = this.view?.level ?? 1;
      if (index >= level) return { title: "Slot trancado", lines: [`Desbloqueia no Nível ${index + 1}`] };
      const item = this.view?.essences[index];
      const stats = item ? (ITEMS[item as ItemId] as (typeof ITEMS)[ItemId] | undefined) : undefined;
      if (!stats || !("essence" in stats)) {
        return { title: "Slot livre", lines: ["Consuma uma essência para ocupá-lo."] };
      }
      const rarity = rarityStyle(stats.rarity);
      return {
        title: `${stats.name}: ${essenceEffectText(stats.essence)}`,
        titleColor: rarity.color,
        subtitle: rarity.name,
        lines: ["Bônus ativo.", "Só pode ser removida via Purificação na Igreja."],
      };
    });
    return { frame, icon, lock };
  }
}
