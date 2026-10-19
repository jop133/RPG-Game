import {
  BODY_LAYERS,
  INVENTORY_SLOTS,
  ITEMS,
  LEVEL_XP,
  equipSlotOf,
  playerStats,
  statsFrom,
  type EquipSlot,
  type Equipment,
  type ItemId,
  type ItemStats,
} from "shared";
import type { Send } from "./cityWindows";
import layout from "../../assets/ui/hud/layout.json";
import {
  ARMOR_PREVIEW,
  ART,
  EQUIP_NAMES,
  FRONT_SPRITES,
  HELMED_FRONT_SPRITES,
  ICONS,
  KEY_LABELS,
  SlotView,
  WEAPONS,
  el,
  attackText,
  bonusText,
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
import { StatusScroll } from "./statusScroll";

// Janela de inventário (I, Tab ou B), em duas alas lado a lado, cada uma num painel de ferro e couro (inv_panel_wide:
// o painel da arte alargado sem esticar cantos nem brasão, ver process_hud.py):
// - esquerda, a mochila: os 12 slots em dois blocos (o cinturão rápido, atalhos 1 a 6, e a carga, 7 a =), as moedas e
//   um quadro de inspeção do item sob o mouse;
// - direita, o personagem: sprite grande (com a armadura equipada por cima) entre os 8 slots de equipamento (armaduras
//   à esquerda, arma, escudo, amuleto e anel à direita), o botão "Status" (abre o pergaminho dos 12 status ao lado,
//   StatusScroll) e o altar das essências absorvidas.
// Só desenho: os números vêm do servidor ou das mesmas regras puras de shared. Medidas em px de tela na tela-base
// (1366x768), ampliadas com o resto da HUD (--u).
// Arrastar e soltar (só pede; quem decide e muda é o servidor, regra 1): entre slots da mochila manda "move"; da
// mochila para o slot de equipamento da peça, "equip"; do slot de equipamento para a mochila, "unequip". Clicar num item
// usa (peça: equipa); clicar numa peça equipada guarda na mochila.

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
  // O que está equipado, slot -> id de item (slot ausente = vazio).
  equipment: Partial<Record<EquipSlot, string>>;
}

// O que está sendo arrastado: um slot da mochila ou uma peça equipada.
type Dragging = { from: "bag"; slot: number } | { from: "equip"; slot: EquipSlot };

// Um slot de equipamento: a silhueta (moldura da arte) e o ícone da peça equipada por cima.
interface EquipSlotView {
  frame: HTMLImageElement;
  icon: HTMLImageElement;
}
// Arrasto em andamento: de onde saiu, onde o ponteiro desceu e o ícone que segue o cursor (só depois de andar).
interface Drag {
  source: Dragging;
  node: HTMLElement;
  x: number;
  y: number;
  ghost?: HTMLImageElement;
}
const DRAG_START_PX = 5;
const GHOST = 48;

const PANEL = layout.inv_panel_wide;
const LEATHER = layout.leather_wide;
const GAP_BETWEEN = 16;
// O pergaminho dos status, à direita da ala do personagem: a janela alarga e continua centrada.
const SCROLL_W = layout.status_scroll.w;
const STATUS_BUTTON = { w: 140, h: 30 };
const STATUS_AREA = 36; // altura do vão do botão Status, entre o personagem e o altar
const SLOT = 68;
const SLOT_GAP = 6;
const BELT = 6;
const COLUMNS = 3;
// 4 slots de cada lado do personagem: um pouco menores que os da mochila, para o altar caber embaixo.
const EQUIP = 58;
const EQUIP_GAP = 5;
const EQUIP_ROWS = 4;
const ESSENCE = 54;
const ESSENCE_GAP = 8;
const ESSENCE_COLUMNS = 4;
const SPRITE = 160; // o sprite parado de frente (64 px) em 2,5x
// Nível = número de slots de essência; o maior nível é o último limite de LEVEL_XP.
const MAX_ESSENCE_SLOTS = LEVEL_XP.length + 1;
// Colunas do equipamento, de cima para baixo: armaduras à esquerda; arma, escudo e joias à direita.
const EQUIP_LEFT: readonly EquipSlot[] = ["helm", "chest", "pants", "boots"];
const EQUIP_RIGHT: readonly EquipSlot[] = ["weapon", "shield", "amulet", "ring"];

interface EssenceSlot {
  frame: HTMLImageElement;
  icon: HTMLImageElement;
  lock: HTMLImageElement;
}

export class InventoryWindow {
  readonly root: HTMLDivElement;
  // Fundo escurecido atrás da janela (fica no HUD, fora da janela ampliada).
  private readonly backdrop: HTMLDivElement;
  private readonly sprite: HTMLImageElement;
  private readonly heroTitle: HTMLDivElement;
  private readonly statusButton: HTMLButtonElement;
  private readonly scroll: StatusScroll;
  private readonly essenceTitle: HTMLDivElement;
  private readonly essenceSlots: EssenceSlot[] = [];
  private readonly bagSlots: SlotView[] = [];
  private readonly slotsText: HTMLSpanElement;
  private readonly coinText: HTMLSpanElement;
  private readonly inspect: { icon: HTMLImageElement; frame: HTMLImageElement; name: HTMLDivElement; rarity: HTMLDivElement; text: HTMLDivElement; hint: HTMLDivElement };
  private inspected: number | undefined;
  private view?: InventoryView;
  private shownEssences = "";
  private drag: Drag | undefined;
  private readonly targets = new Map<HTMLElement, (dragging: Dragging, drop: boolean) => boolean>();
  private readonly equipViews = new Map<EquipSlot, EquipSlotView>();
  // A armadura equipada por cima do sprite do personagem (uma camada por peça do corpo).
  private readonly armorLayers = new Map<EquipSlot, HTMLImageElement>();

  constructor(parent: HTMLElement, tooltip: Tooltip, onUse: (slot: number) => void, private readonly send: Send, onClose: () => void) {
    this.listenDrag();
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
        this.dragSource(slot.root, () => (this.view?.inventory[i]?.count ? { from: "bag", slot: i } : undefined));
        this.dropTarget(slot.root, (dragging, drop) => this.dropOnBag(dragging, i, drop));
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
    place(el("div", "hud-abs hud-inv-footer", left), 0, PANEL.h - 44, PANEL.w).textContent =
      "Arraste para mover ou equipar · [Esc] fecha";

    // ---- Ala direita: personagem, equipamento, atributos, essências ----
    this.heroTitle = place(el("div", "hud-abs hud-inv-title", right), 0, LEATHER.y - 30, PANEL.w);
    const equipTop = LEATHER.y + 8;
    const equipLeft = LEATHER.x + 12;
    const equipRight = LEATHER.x + LEATHER.w - 12 - EQUIP;
    EQUIP_LEFT.forEach((slot, i) => this.equipSlot(right, tooltip, slot, equipLeft, equipTop + i * (EQUIP + EQUIP_GAP)));
    EQUIP_RIGHT.forEach((slot, i) => this.equipSlot(right, tooltip, slot, equipRight, equipTop + i * (EQUIP + EQUIP_GAP)));
    const column = EQUIP_ROWS * EQUIP + (EQUIP_ROWS - 1) * EQUIP_GAP;
    const arenaX = equipLeft + EQUIP + 8;
    const arenaW = equipRight - 8 - arenaX;
    place(el("div", "hud-abs hud-inv-arena", right), arenaX, equipTop, arenaW, column);
    place(el("div", "hud-abs hud-pedestal", right), arenaX + 16, equipTop + column - 40, arenaW - 32, 30);
    const spriteX = arenaX + (arenaW - SPRITE) / 2;
    const spriteY = equipTop + column - SPRITE - 12;
    this.sprite = place(el("img", "hud-abs hud-character", right), spriteX, spriteY, SPRITE, SPRITE);
    this.sprite.alt = "";
    this.sprite.draggable = false;
    for (const piece of BODY_LAYERS) {
      const layer = place(el("img", "hud-abs hud-character", right), spriteX, spriteY, SPRITE, SPRITE);
      layer.alt = "";
      layer.draggable = false;
      layer.hidden = true;
      this.armorLayers.set(piece, layer);
    }
    // Botão do pergaminho dos status, no vão entre o personagem e o altar (onde ficavam as placas de atributo).
    const statusTop = equipTop + column + 6;
    this.statusButton = place(
      el("button", "hud-abs hud-inv-status-btn", right),
      LEATHER.x + (LEATHER.w - STATUS_BUTTON.w) / 2,
      statusTop + (STATUS_AREA - STATUS_BUTTON.h) / 2,
      STATUS_BUTTON.w,
      STATUS_BUTTON.h,
    );
    this.statusButton.type = "button";
    this.statusButton.textContent = "Status";
    this.statusButton.addEventListener("click", () => this.setScrollOpen(!this.scroll.open));
    this.scroll = new StatusScroll(this.root, PANEL.w * 2 + GAP_BETWEEN * 2, 0);
    // Altar das essências: os slots que o nível abre e os próximos, trancados.
    const altarTop = statusTop + STATUS_AREA;
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

  // O pergaminho abre ao lado da ala do personagem: a janela alarga (e continua centrada, pelo translate(-50%)).
  private setScrollOpen(open: boolean) {
    this.scroll.setOpen(open);
    this.statusButton.classList.toggle("hud-inv-status-open", open);
    size(this.root, PANEL.w * 2 + GAP_BETWEEN + (open ? GAP_BETWEEN + SCROLL_W : 0), PANEL.h);
  }

  private setOpen(open: boolean) {
    this.root.hidden = !open;
    this.backdrop.hidden = !open;
    if (!open) this.setInspected(undefined);
  }

  update(view: InventoryView) {
    this.view = view;
    // Com elmo, o corpo sem o que o elmo esconde (orelhas, chapéu), nas classes que têm essa versão.
    const helmed = view.equipment.helm ? HELMED_FRONT_SPRITES.get(view.classId) : undefined;
    const sprite = helmed ?? FRONT_SPRITES.get(view.classId) ?? FRONT_SPRITES.get("mago") ?? "";
    if (this.sprite.getAttribute("src") !== sprite) this.sprite.src = sprite;
    setText(this.heroTitle, `${view.name} — ${classLabel(view.classId)}`);
    // Bônus no pergaminho = o que vem de essências e equipamento, sobre a base com o golpe da arma.
    const stats = playerStats(view.essences as ItemId[], this.equipment());
    this.scroll.update(stats, statsFrom([], stats.attack));
    setText(this.essenceTitle, `Essências absorvidas (${view.essences.length} / ${view.level})`);
    const used = view.inventory.filter((slot) => slot && slot.count > 0).length;
    setText(this.slotsText, `Slots: ${used} / ${INVENTORY_SLOTS}`);
    setText(this.coinText, String(view.coins));
    this.updateEssences(view);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = view.inventory[i];
      this.bagSlots[i]?.set(slot && slot.count > 0 ? slot : undefined);
    }
    this.updateEquipment(view);
    this.renderInspect();
  }

  private equipment(): Equipment {
    return (this.view?.equipment ?? {}) as Equipment;
  }

  // Cada slot mostra a peça equipada (a arma: a mesma arte que gira no golpe, em diagonal) ou só a silhueta; o sprite
  // do personagem veste as armaduras do corpo.
  private updateEquipment(view: InventoryView) {
    for (const [slot, { frame, icon }] of this.equipViews) {
      const item = view.equipment[slot];
      const src = item ? (slot === "weapon" ? WEAPONS.get(item) : ICONS.get(item)) ?? "" : "";
      icon.hidden = !src;
      if (src && icon.getAttribute("src") !== src) icon.src = src;
      frame.classList.toggle("hud-equipped", Boolean(src));
      // Ocupado: a moldura da raridade da peça; vazio: a silhueta do slot.
      const rarity = item ? (ITEMS[item as ItemId] as ItemStats | undefined)?.rarity : undefined;
      const frameSrc = ART.get(rarity ? frameName(rarity, 48) : `equip_${slot}`) ?? "";
      if (frame.getAttribute("src") !== frameSrc) frame.src = frameSrc;
    }
    for (const [piece, layer] of this.armorLayers) {
      const item = view.equipment[piece];
      const look = item ? (ITEMS[item as ItemId] as ItemStats | undefined)?.equip?.look : undefined;
      const src = look ? ARMOR_PREVIEW.get(`${view.classId}/${look}/${piece}`) : undefined;
      layer.hidden = !src;
      if (src && layer.getAttribute("src") !== src) layer.src = src;
    }
  }

  // ---- arrastar e soltar ----
  // Com eventos de ponteiro (não o arrastar nativo do HTML): o ícone segue o cursor e, ao soltar, vale o alvo que
  // estiver embaixo. Funciona igual com mouse e toque. Só depois de DRAG_START_PX de movimento vira arrasto; antes
  // disso é um clique comum (usar o item, guardar a arma).

  private dragSource(node: HTMLElement, start: () => Dragging | undefined) {
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const source = start();
      if (source) this.drag = { source, node, x: event.clientX, y: event.clientY };
    });
  }

  // `accept` diz se o que está sendo arrastado pode cair aqui (drop = false, enquanto passa por cima) e, ao soltar
  // (drop = true), manda o pedido.
  private dropTarget(node: HTMLElement, accept: (dragging: Dragging, drop: boolean) => boolean) {
    this.targets.set(node, accept);
  }

  private listenDrag() {
    window.addEventListener("pointermove", (event) => {
      const drag = this.drag;
      if (!drag) return;
      if (!drag.ghost) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_START_PX) return;
        drag.ghost = this.ghost(drag.source);
        drag.node.classList.add("hud-dragging");
      }
      drag.ghost.style.left = `${event.clientX - GHOST / 2}px`;
      drag.ghost.style.top = `${event.clientY - GHOST / 2}px`;
      const target = this.targetAt(event.clientX, event.clientY);
      for (const node of this.targets.keys()) node.classList.toggle("hud-drop", node === target?.node && target.accept(drag.source, false));
    });
    window.addEventListener("pointerup", (event) => {
      const drag = this.drag;
      this.drag = undefined;
      if (!drag?.ghost) return;
      drag.ghost.remove();
      drag.node.classList.remove("hud-dragging");
      for (const node of this.targets.keys()) node.classList.remove("hud-drop");
      this.targetAt(event.clientX, event.clientY)?.accept(drag.source, true);
      // O clique que o navegador manda depois de soltar não pode usar o item nem fechar a janela.
      const stopClick = (click: MouseEvent) => click.stopPropagation();
      window.addEventListener("click", stopClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", stopClick, { capture: true }), 0);
    });
  }

  // O alvo sob o cursor: o elemento lá ou um dos pais dele que seja alvo.
  private targetAt(x: number, y: number): { node: HTMLElement; accept: (dragging: Dragging, drop: boolean) => boolean } | undefined {
    for (let node = document.elementFromPoint(x, y); node; node = node.parentElement) {
      const accept = this.targets.get(node as HTMLElement);
      if (accept) return { node: node as HTMLElement, accept };
    }
    return undefined;
  }

  // O ícone que acompanha o cursor: o do item, ou a arma em diagonal.
  private ghost(source: Dragging): HTMLImageElement {
    const ghost = document.createElement("img");
    const weapon = source.from === "equip" && source.slot === "weapon";
    ghost.className = `hud-drag-ghost${weapon ? " hud-drag-ghost-weapon" : ""}`;
    ghost.alt = "";
    const item = source.from === "bag" ? this.view?.inventory[source.slot]?.item : this.view?.equipment[source.slot];
    ghost.src = (weapon ? WEAPONS.get(item ?? "") : ICONS.get(item ?? "")) ?? "";
    document.body.append(ghost);
    return ghost;
  }

  // Soltar num slot da mochila: outro slot da mochila move (ou junta, ou troca); uma peça equipada volta para a
  // mochila ali.
  private dropOnBag(dragging: Dragging, to: number, drop: boolean): boolean {
    if (dragging.from === "bag" && dragging.slot === to) return false;
    if (!drop) return true;
    if (dragging.from === "bag") this.send("move", { from: dragging.slot, to });
    else this.send("unequip", { slot: dragging.slot, to });
    return true;
  }

  // Soltar num slot de equipamento: só um item da mochila que se equipe naquele slot.
  private dropOnEquip(target: EquipSlot, dragging: Dragging, drop: boolean): boolean {
    if (dragging.from !== "bag") return false;
    const item = this.view?.inventory[dragging.slot]?.item;
    if (!item || equipSlotOf(item as ItemId) !== target) return false;
    if (drop) this.send("equip", { slot: dragging.slot });
    return true;
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

  // Um slot de equipamento: a silhueta do slot e, por cima, a peça equipada. Clicar guarda a peça na mochila;
  // arrastar leva para um slot escolhido; soltar uma peça da mochila equipa (se for deste slot).
  private equipSlot(parent: HTMLElement, tooltip: Tooltip, slot: EquipSlot, x: number, y: number) {
    const name = EQUIP_NAMES[slot];
    const frame = place(image(`equip_${slot}`, "hud-abs hud-equip", parent), x, y, EQUIP, EQUIP);
    const iconSize = 48;
    const icon = place(el("img", `hud-abs ${slot === "weapon" ? "hud-weapon-icon" : "hud-equip-icon"}`, parent), x + (EQUIP - iconSize) / 2, y + (EQUIP - iconSize) / 2, iconSize, iconSize);
    icon.alt = "";
    icon.hidden = true;
    // Sem o arrastar nativo de imagem: o arrasto é o nosso (dragSource).
    icon.draggable = false;
    this.equipViews.set(slot, { frame, icon });
    const describe = () => {
      const item = this.view?.equipment[slot];
      const stats = playerStats((this.view?.essences ?? []) as ItemId[], this.equipment());
      const attack = attackText({ ...stats.attack, damage: stats.physicalDamage });
      if (!item) {
        if (slot === "weapon") return { title: `${name}: vazio`, subtitle: "Desarmado (soco)", lines: [attack], hint: "Arraste uma arma da mochila para cá" };
        return { title: `${name}: vazio`, lines: [], hint: "Arraste uma peça da mochila para cá" };
      }
      const itemStats = ITEMS[item as ItemId] as ItemStats;
      const lines = slot === "weapon" ? [attack, "Golpe com o clique, na direção do mouse."] : [`${bonusText(itemStats.equip?.bonus ?? {})}.`];
      const rarity = rarityStyle(itemStats.rarity);
      return { title: itemStats.name, titleColor: rarity.color, subtitle: `${name} (equipado)`, lines, hint: "Clique para guardar na mochila · arraste para um slot" };
    };
    const unequip = () => {
      if (this.view?.equipment[slot]) this.send("unequip", { slot });
    };
    for (const node of [frame, icon]) {
      tooltip.attach(node, describe);
      node.addEventListener("click", unequip);
      this.dragSource(node, () => (this.view?.equipment[slot] ? { from: "equip", slot } : undefined));
      this.dropTarget(node, (dragging, drop) => this.dropOnEquip(slot, dragging, drop));
    }
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
