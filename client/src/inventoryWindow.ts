import {
  INVENTORY_SLOTS,
  ITEMS,
  LEVEL_XP,
  PLAYER_ATTACK,
  PLAYER_MAX_HP,
  PLAYER_SPEED,
  levelProgress,
  playerStats,
  type ItemId,
} from "shared";
import layout from "../../assets/ui/hud/layout.json";
import {
  ART,
  EQUIP_NAMES,
  FRONT_SPRITES,
  ICONS,
  KEY_LABELS,
  SlotView,
  WEAPONS,
  el,
  essenceEffectText,
  frameName,
  image,
  itemTooltip,
  place,
  rarityStyle,
  setText,
  size,
  type HudSlot,
  type Tooltip,
} from "./hudParts";
import { classLabel } from "./registration";

// Janela de inventário (I, Tab ou B), em duas alas lado a lado, cada uma num painel de ferro e couro (inv_panel_wide:
// o painel da arte alargado sem esticar cantos nem brasão, ver process_hud.py):
// - esquerda, a mochila: os 12 slots em dois blocos (o cinturão rápido, atalhos 1 a 6, e a carga, 7 a =), as moedas e
//   um quadro de inspeção do item sob o mouse;
// - direita, o personagem: sprite grande com os 6 slots de equipamento dos lados, 4 placas de atributo e o altar das
//   essências absorvidas.
// Só desenho: os números vêm do servidor ou das mesmas regras puras de shared. Medidas em px de tela na tela-base
// (1366x768), ampliadas com o resto da HUD (--u).

export interface InventoryView {
  name: string;
  classId: string;
  level: number;
  xp: number;
  nextLevelXp?: number;
  maxHp: number;
  essences: readonly string[];
  coins: number;
  inventory: readonly (HudSlot | undefined)[];
}

const PANEL = layout.inv_panel_wide;
const LEATHER = layout.leather_wide;
const GAP_BETWEEN = 16;
const SLOT = 68;
const SLOT_GAP = 6;
const BELT = 6;
const COLUMNS = 3;
const EQUIP = 68;
const EQUIP_GAP = 6;
const ESSENCE = 60;
const ESSENCE_GAP = 8;
const ESSENCE_COLUMNS = 4;
const SPRITE = 160; // o sprite parado de frente (64 px) em 2,5x
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

interface StatPlate {
  value: HTMLSpanElement;
  bonus: HTMLSpanElement;
}

export class InventoryWindow {
  readonly root: HTMLDivElement;
  // Fundo escurecido atrás da janela (fica no HUD, fora da janela ampliada).
  private readonly backdrop: HTMLDivElement;
  private readonly sprite: HTMLImageElement;
  private readonly heroTitle: HTMLDivElement;
  private readonly plates: Record<"hp" | "damage" | "speed" | "level", StatPlate>;
  private readonly essenceTitle: HTMLDivElement;
  private readonly essenceSlots: EssenceSlot[] = [];
  private readonly bagSlots: SlotView[] = [];
  private readonly slotsText: HTMLSpanElement;
  private readonly coinText: HTMLSpanElement;
  private readonly inspect: { icon: HTMLImageElement; frame: HTMLImageElement; name: HTMLDivElement; rarity: HTMLDivElement; text: HTMLDivElement; hint: HTMLDivElement };
  private inspected: number | undefined;
  private view?: InventoryView;
  private shownEssences = "";

  constructor(parent: HTMLElement, tooltip: Tooltip, onUse: (slot: number) => void, onClose: () => void) {
    this.backdrop = el("div", "hud-inv-backdrop", parent);
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", onClose);
    this.root = el("div", "hud-window hud-inv", parent);
    this.root.hidden = true;
    size(this.root, PANEL.w * 2 + GAP_BETWEEN, PANEL.h);
    const left = place(el("div", "hud-abs", this.root), 0, 0, PANEL.w, PANEL.h);
    const right = place(el("div", "hud-abs", this.root), PANEL.w + GAP_BETWEEN, 0, PANEL.w, PANEL.h);
    image("inv_panel_wide", "hud-abs", left);
    image("inv_panel_wide", "hud-abs", right);
    const close = place(el("button", "hud-abs hud-inv-close", right), LEATHER.x + LEATHER.w - 30, LEATHER.y - 34, 30, 30);
    close.type = "button";
    close.textContent = "✕";
    close.title = "Fechar [Esc]";
    close.addEventListener("click", onClose);

    // ---- Ala esquerda: a mochila ----
    place(el("div", "hud-abs hud-inv-title", left), 0, LEATHER.y - 30, PANEL.w).textContent = "Mochila de Exploração";
    const header = place(el("div", "hud-abs hud-inv-header", left), LEATHER.x + 8, LEATHER.y + 4, LEATHER.w - 16, 26);
    this.slotsText = el("span", "hud-inv-slots", header);
    const purse = el("span", "hud-inv-purse", header);
    image("icon_coin", "hud-coin", purse);
    this.coinText = el("span", "", purse);
    tooltip.attach(purse, () => ({ title: "Moedas da linhagem", lines: ["Ficam com a linhagem: o herdeiro herda.", "Ganhe vendendo loot na Guilda."] }));
    const grid = COLUMNS * SLOT + (COLUMNS - 1) * SLOT_GAP;
    const gridX = LEATHER.x + (LEATHER.w - grid) / 2;
    const block = (title: string, top: number, first: number, belt: boolean) => {
      place(el("div", "hud-abs hud-section-title hud-inv-section", left), LEATHER.x, top, LEATHER.w).textContent = title;
      const height = 2 * SLOT + SLOT_GAP;
      place(el("div", `hud-abs hud-inv-block${belt ? " hud-inv-belt" : ""}`, left), gridX - 8, top + 16, grid + 16, height + 12);
      for (let i = first; i < first + BELT; i++) {
        const slot = new SlotView(left, i, onUse, tooltip, { frameSize: 48, iconScale: 3, emptyFrame: true, display: SLOT, noTooltip: true });
        const k = i - first;
        place(slot.root, gridX + (k % COLUMNS) * (SLOT + SLOT_GAP), top + 22 + Math.floor(k / COLUMNS) * (SLOT + SLOT_GAP));
        slot.root.classList.add("hud-inv-slot");
        slot.root.addEventListener("mouseenter", () => this.setInspected(i));
        slot.root.addEventListener("mouseleave", () => this.setInspected(undefined));
        this.bagSlots.push(slot);
      }
    };
    // Cada bloco: título (16 px) + moldura com 2 fileiras de 3 slots (154 px) + 4 px de folga.
    const beltTop = LEATHER.y + 32;
    const blockHeight = 16 + 2 * SLOT + SLOT_GAP + 12 + 4;
    block(`Cinturão rápido (atalhos 1 a 6)`, beltTop, 0, true);
    block(`Carga da mochila (atalhos ${KEY_LABELS[6]} a ${KEY_LABELS[INVENTORY_SLOTS - 1]})`, beltTop + blockHeight, BELT, false);
    // Quadro de inspeção, no pé do couro.
    const inspectTop = beltTop + 2 * blockHeight + 4;
    const card = place(el("div", "hud-abs hud-inv-inspect", left), LEATHER.x + 8, inspectTop, LEATHER.w - 16, LEATHER.y + LEATHER.h - 2 - inspectTop);
    const frame = place(image(frameName("common", 48), "hud-abs", card), 8, 6, 54, 54);
    const icon = place(el("img", "hud-abs hud-inv-inspect-icon", card), 11, 9, 48, 48);
    icon.alt = "";
    this.inspect = {
      frame,
      icon,
      name: place(el("div", "hud-abs hud-inv-inspect-name", card), 72, 4, LEATHER.w - 96),
      rarity: place(el("div", "hud-abs hud-inv-inspect-rarity", card), 72, 6, LEATHER.w - 96),
      text: place(el("div", "hud-abs hud-inv-inspect-text", card), 72, 21, LEATHER.w - 96, 28),
      hint: place(el("div", "hud-abs hud-inv-inspect-hint", card), 72, 50, LEATHER.w - 96),
    };
    place(el("div", "hud-abs hud-inv-footer", left), 0, PANEL.h - 44, PANEL.w).textContent = "[I / Tab / B] ou [Esc] fecha";

    // ---- Ala direita: personagem, equipamento, atributos, essências ----
    this.heroTitle = place(el("div", "hud-abs hud-inv-title", right), 0, LEATHER.y - 30, PANEL.w);
    const equipTop = LEATHER.y + 8;
    const equipLeft = LEATHER.x + 12;
    const equipRight = LEATHER.x + LEATHER.w - 12 - EQUIP;
    EQUIP_LEFT.forEach(([art, name], i) => this.equipSlot(right, tooltip, art, name, equipLeft, equipTop + i * (EQUIP + EQUIP_GAP)));
    EQUIP_RIGHT.forEach(([art, name], i) => this.equipSlot(right, tooltip, art, name, equipRight, equipTop + i * (EQUIP + EQUIP_GAP)));
    const column = 3 * EQUIP + 2 * EQUIP_GAP;
    const arenaX = equipLeft + EQUIP + 8;
    const arenaW = equipRight - 8 - arenaX;
    place(el("div", "hud-abs hud-inv-arena", right), arenaX, equipTop, arenaW, column);
    place(el("div", "hud-abs hud-pedestal", right), arenaX + 16, equipTop + column - 40, arenaW - 32, 30);
    this.sprite = place(el("img", "hud-abs hud-character", right), arenaX + (arenaW - SPRITE) / 2, equipTop + column - SPRITE - 12, SPRITE, SPRITE);
    this.sprite.alt = "";
    this.sprite.draggable = false;
    // 4 placas de atributo, em 2x2.
    const platesTop = equipTop + column + 6;
    const plateW = (LEATHER.w - 24 - 8) / 2;
    const plate = (label: string, i: number): StatPlate => {
      const box = place(el("div", "hud-abs hud-inv-plate", right), LEATHER.x + 12 + (i % 2) * (plateW + 8), platesTop + Math.floor(i / 2) * 34, plateW, 30);
      el("span", "hud-inv-plate-label", box).textContent = label;
      const value = el("span", "hud-inv-plate-value", box);
      const bonus = el("span", "hud-inv-plate-bonus", box);
      return { value, bonus };
    };
    this.plates = { hp: plate("Vida Máx.", 0), damage: plate("Dano", 1), speed: plate("Velocidade", 2), level: plate("Nível", 3) };
    tooltip.attach(this.plates.damage.value.parentElement as HTMLElement, () => ({
      title: "Espada de Ferro (arma inicial)",
      lines: [`Alcance ${PLAYER_ATTACK.range} px  ·  Arco ${PLAYER_ATTACK.arcDegrees}°`, "Golpe com o clique, na direção do mouse."],
    }));
    // Altar das essências: os slots que o nível abre e os próximos, trancados.
    const altarTop = platesTop + 2 * 34 + 2;
    this.essenceTitle = place(el("div", "hud-abs hud-section-title hud-inv-section", right), LEATHER.x, altarTop, LEATHER.w);
    for (let i = 0; i < MAX_ESSENCE_SLOTS; i++) {
      const row = Math.floor(i / ESSENCE_COLUMNS);
      const inRow = Math.min(ESSENCE_COLUMNS, MAX_ESSENCE_SLOTS - row * ESSENCE_COLUMNS);
      const rowX = LEATHER.x + (LEATHER.w - (inRow * ESSENCE + (inRow - 1) * ESSENCE_GAP)) / 2;
      const x = rowX + (i % ESSENCE_COLUMNS) * (ESSENCE + ESSENCE_GAP);
      this.essenceSlots.push(this.essenceSlot(right, tooltip, i, Math.round(x), altarTop + 18 + row * (ESSENCE + 6)));
    }
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle() {
    this.setOpen(this.root.hidden);
  }

  close() {
    this.setOpen(false);
  }

  private setOpen(open: boolean) {
    this.root.hidden = !open;
    this.backdrop.hidden = !open;
    if (!open) this.setInspected(undefined);
  }

  update(view: InventoryView) {
    this.view = view;
    const sprite = FRONT_SPRITES.get(view.classId) ?? FRONT_SPRITES.get("mago") ?? "";
    if (this.sprite.getAttribute("src") !== sprite) this.sprite.src = sprite;
    setText(this.heroTitle, `${view.name} — ${classLabel(view.classId)}`);
    const stats = playerStats(view.essences as ItemId[]);
    const base = playerStats([]);
    this.setPlate(this.plates.hp, String(view.maxHp), view.maxHp - PLAYER_MAX_HP, "");
    this.setPlate(this.plates.damage, String(stats.damage), stats.damage - base.damage, "");
    const speedBonus = Math.round((stats.speed / PLAYER_SPEED - 1) * 100);
    this.setPlate(this.plates.speed, String(Math.round(stats.speed)), speedBonus, "%");
    const progress = levelProgress(view.level, view.xp);
    const xp = progress.xpNext === undefined ? `XP ${view.xp} (máx.)` : `XP ${view.xp} / ${progress.xpNext}`;
    this.setPlate(this.plates.level, String(view.level), 0, "");
    setText(this.plates.level.bonus, xp);
    this.plates.level.bonus.classList.add("hud-inv-plate-xp");
    setText(this.essenceTitle, `Essências absorvidas (${view.essences.length} / ${view.level})`);
    const used = view.inventory.filter((slot) => slot && slot.count > 0).length;
    setText(this.slotsText, `Slots: ${used} / ${INVENTORY_SLOTS}`);
    setText(this.coinText, String(view.coins));
    this.updateEssences(view);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = view.inventory[i];
      this.bagSlots[i]?.set(slot && slot.count > 0 ? slot : undefined);
    }
    this.renderInspect();
  }

  private setPlate(plate: StatPlate, value: string, bonus: number, unit: string) {
    setText(plate.value, value);
    setText(plate.bonus, bonus > 0 ? `(+${bonus}${unit})` : "");
  }

  private setInspected(index: number | undefined) {
    this.inspected = index;
    this.renderInspect();
  }

  // O quadro de inspeção: o item sob o mouse, com o mesmo texto da dica (itemTooltip), ou um convite quando nada.
  private renderInspect() {
    const index = this.inspected;
    const slot = index === undefined ? undefined : this.view?.inventory[index];
    const stats = slot && slot.count > 0 ? (ITEMS[slot.item as ItemId] as (typeof ITEMS)[ItemId] | undefined) : undefined;
    const content = stats && slot && index !== undefined ? itemTooltip(slot.item, slot.count, KEY_LABELS[index]) : undefined;
    const { icon, frame, name, rarity, text, hint } = this.inspect;
    if (!content || !stats || !slot) {
      icon.hidden = true;
      frame.src = ART.get(frameName("common", 48)) ?? "";
      setText(name, index === undefined ? "Passe o mouse sobre um item" : "Slot vazio");
      name.style.color = "";
      setText(rarity, "");
      setText(text, index === undefined ? "Nome, raridade, efeito e como usar aparecem aqui." : "");
      setText(hint, "");
      return;
    }
    icon.hidden = false;
    const src = ICONS.get(slot.item) ?? "";
    if (icon.getAttribute("src") !== src) icon.src = src;
    frame.src = ART.get(frameName(stats.rarity, 48)) ?? "";
    setText(name, content.title);
    name.style.color = content.titleColor ?? "";
    setText(rarity, content.subtitle ?? "");
    rarity.style.color = content.titleColor ?? "";
    setText(text, content.lines.join(" "));
    setText(hint, content.hint ?? "");
  }

  private updateEssences(view: InventoryView) {
    const key = `${view.level}:${view.essences.join(",")}`;
    if (key === this.shownEssences) return;
    this.shownEssences = key;
    this.essenceSlots.forEach((slot, i) => {
      const item = view.essences[i];
      const stats = item ? (ITEMS[item as ItemId] as (typeof ITEMS)[ItemId] | undefined) : undefined;
      const unlocked = i < view.level;
      slot.frame.src = ART.get(frameName(stats?.rarity ?? "common", 48)) ?? "";
      slot.frame.classList.toggle("hud-inv-locked", !unlocked);
      slot.frame.classList.toggle("hud-inv-socket-free", unlocked && !stats);
      slot.icon.hidden = !stats;
      if (item) slot.icon.src = ICONS.get(item) ?? "";
      slot.lock.hidden = unlocked;
    });
  }

  private equipSlot(parent: HTMLElement, tooltip: Tooltip, art: string, name: string, x: number, y: number) {
    const slot = place(image(art, "hud-abs hud-equip", parent), x, y, EQUIP, EQUIP);
    if (art !== "equip_weapon") {
      tooltip.attach(slot, () => ({ title: name, lines: [SOON] }));
      return;
    }
    // Arma inicial: a única até a maestria de armas (passo 8). Dano com as essências; alcance e arco da arma.
    slot.classList.add("hud-equipped");
    // A espada de ferro (a mesma que gira no golpe), em diagonal no slot.
    const icon = place(el("img", "hud-abs hud-weapon-icon", parent), x + (EQUIP - 48) / 2, y + (EQUIP - 48) / 2, 48, 48);
    icon.src = WEAPONS.get("espada_ferro") ?? "";
    icon.alt = "";
    icon.draggable = false;
    const describe = () => {
      const damage = playerStats((this.view?.essences ?? []) as ItemId[]).damage;
      return {
        title: "Espada de Ferro",
        subtitle: `${name} (arma inicial)`,
        lines: [`Dano ${damage}  ·  Alcance ${PLAYER_ATTACK.range} px  ·  Arco ${PLAYER_ATTACK.arcDegrees}°`, "Golpe com o clique, na direção do mouse."],
      };
    };
    tooltip.attach(slot, describe);
    tooltip.attach(icon, describe);
  }

  private essenceSlot(parent: HTMLElement, tooltip: Tooltip, index: number, x: number, y: number): EssenceSlot {
    const box = place(el("div", "hud-abs hud-essence", parent), x, y, ESSENCE, ESSENCE);
    const frame = place(image(frameName("common", 48), "hud-abs", box), 0, 0, ESSENCE, ESSENCE);
    const icon = place(el("img", "hud-abs", box), (ESSENCE - 32) / 2, (ESSENCE - 32) / 2, 32, 32);
    icon.alt = "";
    const lock = place(image("icon_lock", "hud-abs hud-lock", box), (ESSENCE - 32) / 2, (ESSENCE - 32) / 2, 32, 32);
    tooltip.attach(box, () => {
      const level = this.view?.level ?? 1;
      if (index >= level) return { title: "Slot trancado", lines: [`Desbloqueia no Nível ${index + 1}`] };
      const item = this.view?.essences[index];
      const stats = item ? (ITEMS[item as ItemId] as (typeof ITEMS)[ItemId] | undefined) : undefined;
      if (!stats || !("essence" in stats)) {
        return { title: "Engaste livre", lines: ["Consuma uma essência para ocupá-lo."] };
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
