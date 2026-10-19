import { ITEMS, type EquipSlot, type EssenceEffect, type ItemId, type Rarity } from "shared";

// Peças comuns do HUD (hud.ts e inventoryWindow.ts): arte, montagem de elementos, slot clicável e dica (tooltip).

export const ART = urls(import.meta.glob<string>("../../assets/ui/hud/*.png", { eager: true, query: "?url", import: "default" }));
export const ICONS = urls(import.meta.glob<string>("../../assets/ui/hud/items/*.png", { eager: true, query: "?url", import: "default" }));
// Sprite parado de frente de cada classe (prévia do personagem na janela de inventário), pela pasta da classe.
export const FRONT_SPRITES = new Map(
  Object.entries(
    import.meta.glob<string>("../../assets/characters/*/south.png", { eager: true, query: "?url", import: "default" }),
  ).map(([path, url]) => [path.split("/").at(-2) ?? "", url]),
);

// Sprite parado de frente de cada mob (cards do Bestiário), pela pasta do tipo.
export const MOB_SPRITES = new Map(
  Object.entries(import.meta.glob<string>("../../assets/mobs/*/south.png", { eager: true, query: "?url", import: "default" })).map(
    ([path, url]) => [path.split("/").at(-2) ?? "", url],
  ),
);

// Nome de cada slot de equipamento (janela de inventário e vitrine da Forja). A arte de cada um é "equip_<slot>".
export const EQUIP_NAMES: Record<EquipSlot, string> = {
  helm: "Elmo",
  chest: "Peitoral",
  boots: "Botas",
  weapon: "Arma principal",
  shield: "Escudo / Secundária",
  ring: "Relíquia / Anel",
};

function urls(files: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".png".length), url]));
}

export interface HudSlot {
  item: string;
  count: number;
}

export const KEY_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
const RARITY_NAMES: Record<Rarity, string> = { common: "Comum", rare: "Raro", epic: "Épico", legendary: "Lendário" };
const RARITY_COLORS: Record<Rarity, string> = { common: "#cfc6b4", rare: "#5aa9ff", epic: "#c77dff", legendary: "#ffb84d" };

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

export function place<T extends HTMLElement>(node: T, x: number, y: number, w?: number, h?: number): T {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  if (w !== undefined) node.style.width = `${w}px`;
  if (h !== undefined) node.style.height = `${h}px`;
  return node;
}

// Só tamanho: a posição dos blocos presos a um canto vem do CSS.
export function size<T extends HTMLElement>(node: T, w: number, h: number): T {
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
  return node;
}

export function image(name: string, className: string, parent: HTMLElement): HTMLImageElement {
  const img = el("img", className, parent);
  img.src = ART.get(name) ?? "";
  img.alt = "";
  img.draggable = false;
  return img;
}

// Moldura de raridade no tamanho pedido (a arte sai em 48, 34 e 28; ver process_hud.py).
export function frameName(rarity: Rarity, frameSize: number): string {
  return frameSize === 48 ? `slot_${rarity}` : `slot_${rarity}-${frameSize}`;
}

export function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) node.textContent = text;
}

// ---------------------------------------------------------------- dica (tooltip)

export interface TooltipContent {
  title: string;
  titleColor?: string;
  subtitle?: string;
  lines: string[];
  hint?: string;
}

// Caixa de ferro e couro que segue o mouse. Uma só para o HUD inteiro; cada alvo diz o que mostrar na hora.
export class Tooltip {
  private readonly box: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.box = el("div", "hud-tooltip", root);
    this.box.hidden = true;
  }

  attach(target: HTMLElement, content: () => TooltipContent | undefined) {
    target.addEventListener("mouseenter", (event) => this.show(content(), event));
    target.addEventListener("mousemove", (event) => this.move(event));
    target.addEventListener("mouseleave", () => this.hide());
  }

  hide() {
    this.box.hidden = true;
  }

  private show(content: TooltipContent | undefined, event: MouseEvent) {
    if (!content) return this.hide();
    this.box.replaceChildren();
    const title = el("div", "hud-tooltip-title", this.box);
    title.textContent = content.title;
    if (content.titleColor) title.style.color = content.titleColor;
    if (content.subtitle) el("div", "hud-tooltip-subtitle", this.box).textContent = content.subtitle;
    for (const line of content.lines) el("div", "hud-tooltip-line", this.box).textContent = line;
    if (content.hint) el("div", "hud-tooltip-hint", this.box).textContent = content.hint;
    this.box.hidden = false;
    this.move(event);
  }

  // Ao lado do mouse, virando para o outro lado perto da borda da janela.
  private move(event: MouseEvent) {
    if (this.box.hidden) return;
    const gap = 14;
    const { width, height } = this.box.getBoundingClientRect();
    const x = event.clientX + gap + width > window.innerWidth ? event.clientX - gap - width : event.clientX + gap;
    const y = event.clientY + gap + height > window.innerHeight ? event.clientY - gap - height : event.clientY + gap;
    this.box.style.left = `${Math.max(0, x)}px`;
    this.box.style.top = `${Math.max(0, y)}px`;
  }
}

// ---------------------------------------------------------------- textos dos itens (saem dos dados de ITEMS)

export function essenceEffectText(effect: EssenceEffect): string {
  const parts: string[] = [];
  if (effect.speedPercent) parts.push(`+${effect.speedPercent}% Velocidade`);
  if (effect.damage) parts.push(`+${effect.damage} Dano`);
  if (effect.maxHp) parts.push(`+${effect.maxHp} Vida Máxima`);
  return parts.join(", ");
}

export function rarityStyle(rarity: Rarity): { name: string; color: string } {
  return { name: RARITY_NAMES[rarity], color: RARITY_COLORS[rarity] };
}

// key: tecla do slot (o clique usa o item). hint: o que o clique faz em outro lugar (ex.: guardar no baú).
export function itemTooltip(itemId: string, count: number, key?: string, hint?: string): TooltipContent | undefined {
  const stats = ITEMS[itemId as ItemId] as (typeof ITEMS)[ItemId] | undefined;
  if (!stats) return undefined;
  const food = "food" in stats ? stats.food : undefined;
  const essence = "essence" in stats ? stats.essence : undefined;
  const lines: string[] = [];
  if (food) lines.push(`Restaura ${food} de fome.`);
  if (essence) {
    lines.push(`Consuma para absorver ${essenceEffectText(essence)} num slot de essência.`);
    lines.push("Absorvida, só sai por purificação na igreja.");
  }
  if (!food && !essence) lines.push("Material de monstro — extraia vivo do labirinto.");
  if (count > 1) lines.push(`Quantidade: ${count} (até ${stats.maxStack} por slot)`);
  const usable = food !== undefined || essence !== undefined;
  const rarity = rarityStyle(stats.rarity);
  return {
    title: stats.name,
    titleColor: rarity.color,
    subtitle: rarity.name,
    lines,
    hint: hint ?? (usable && key ? `Clique ou pressione [${key}] para usar` : undefined),
  };
}

// ---------------------------------------------------------------- slot clicável

export interface SlotOptions {
  frameSize: 48 | 34 | 28;
  iconScale: 1 | 2 | 3;
  // Tamanho na tela, se diferente da arte (a janela de inventário mostra a moldura de 48 em 68 px).
  display?: number;
  // Sem a dica flutuante (a janela de inventário mostra o item no quadro de inspeção).
  noTooltip?: boolean;
  // Mostrar a moldura comum mesmo vazio (na mochila sim; na barra rápida o vão do dock já é o slot).
  emptyFrame: boolean;
  // Slot das janelas dos prédios: o clique não usa o item, faz outra coisa (guardar, retirar). Sem tecla no canto;
  // a dica diz o que o clique faz agora (undefined = nada).
  clickHint?: () => string | undefined;
}

// Moldura de raridade, ícone, tecla e quantidade; clique usa o item e a dica explica o item. Barra e mochila.
export class SlotView {
  readonly root: HTMLButtonElement;
  private readonly frame: HTMLImageElement;
  private readonly icon: HTMLImageElement;
  private readonly label: HTMLSpanElement;
  private readonly count: HTMLSpanElement;
  // O que está desenhado agora ("item:quantidade"; "" = vazio). Começa indefinido para o primeiro set() sempre
  // desenhar, inclusive o slot vazio.
  private shown: string | undefined;
  private slot: HudSlot | undefined;

  constructor(
    parent: HTMLElement,
    private readonly index: number,
    onUse: (slot: number) => void,
    tooltip: Tooltip,
    private readonly options: SlotOptions,
  ) {
    this.root = el("button", "hud-slot", parent);
    this.root.type = "button";
    const box = options.display ?? options.frameSize;
    size(this.root, box, box);
    this.frame = image(frameName("common", options.frameSize), "hud-slot-frame", this.root);
    size(this.frame, box, box);
    this.icon = el("img", "hud-slot-icon", this.root);
    this.icon.alt = "";
    this.icon.draggable = false;
    const iconSize = 16 * options.iconScale;
    const offset = (box - iconSize) / 2;
    place(this.icon, offset, offset, iconSize, iconSize);
    this.label = el("span", "hud-slot-sigla", this.root);
    if (!options.clickHint) el("span", "hud-slot-key", this.root).textContent = KEY_LABELS[index] ?? "";
    this.count = el("span", "hud-slot-count", this.root);
    this.root.addEventListener("click", () => onUse(index));
    if (!options.noTooltip) {
      tooltip.attach(this.root, () => {
        if (!this.slot) return { title: "Slot vazio", lines: [] };
        if (options.clickHint) return itemTooltip(this.slot.item, this.slot.count, undefined, options.clickHint());
        return itemTooltip(this.slot.item, this.slot.count, KEY_LABELS[this.index]);
      });
    }
    this.set(undefined);
  }

  set(slot: HudSlot | undefined) {
    this.slot = slot;
    const key = slot ? `${slot.item}:${slot.count}` : "";
    if (key === this.shown) return;
    this.shown = key;
    const stats = slot ? (ITEMS[slot.item as ItemId] as (typeof ITEMS)[ItemId] | undefined) : undefined;
    this.root.classList.toggle("hud-empty", !stats);
    this.frame.src = ART.get(frameName(stats?.rarity ?? "common", this.options.frameSize)) ?? "";
    this.frame.hidden = !stats && !this.options.emptyFrame;
    const icon = stats ? ICONS.get(slot?.item ?? "") : undefined;
    this.icon.hidden = !icon;
    if (icon) this.icon.src = icon;
    // Item sem ícone desenhado: a sigla, como no HUD antigo.
    this.label.textContent = stats && !icon ? stats.name.slice(0, 3) : "";
    this.count.textContent = slot && slot.count > 1 ? `x${slot.count}` : "";
  }
}

// ---------------------------------------------------------------- peças das janelas dos prédios

// Ícone de item com a moldura da raridade, sem clique (listas da loja). A dica explica o item.
export class ItemBadge {
  readonly root: HTMLDivElement;
  private readonly frame: HTMLImageElement;
  private readonly icon: HTMLImageElement;
  private item = "";
  private count = 0;

  constructor(parent: HTMLElement, tooltip: Tooltip, private readonly frameSize: 48 | 34 | 28) {
    this.root = size(el("div", "hud-abs hud-badge-item", parent), frameSize, frameSize);
    this.frame = size(image(frameName("common", frameSize), "hud-abs", this.root), frameSize, frameSize);
    this.icon = el("img", "hud-abs", this.root);
    this.icon.alt = "";
    this.icon.draggable = false;
    place(this.icon, (frameSize - 16) / 2, (frameSize - 16) / 2, 16, 16);
    tooltip.attach(this.root, () => itemTooltip(this.item, this.count));
  }

  set(item: string, count: number) {
    this.count = count;
    if (item === this.item) return;
    this.item = item;
    const stats = ITEMS[item as ItemId] as (typeof ITEMS)[ItemId] | undefined;
    this.frame.src = ART.get(frameName(stats?.rarity ?? "common", this.frameSize)) ?? "";
    this.icon.src = ICONS.get(item) ?? "";
  }
}

export function button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", "hud-abs hud-btn", parent);
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

// Ícone de moeda e o número, em linha (o número muda com setText no span devolvido).
export function coinAmount(parent: HTMLElement, className = ""): HTMLSpanElement {
  const box = el("span", `hud-coins ${className}`, parent);
  image("icon_coin", "hud-coin", box);
  return el("span", "", box);
}

