import { HUNGER_MAX, INVENTORY_SLOTS, ITEMS, type ItemId, type Rarity } from "shared";
import layout from "../../assets/ui/hud/layout.json";
import "./hud.css";

// HUD em HTML, por cima do jogo (como a ficha de registro): a arte dos kits de interface ampliada por um fator
// inteiro, com pixels nítidos em qualquer janela, livre da luz e do tremor da câmera. Só desenha: os dados chegam
// do jogo a cada quadro (update), e usar um item manda a mesma mensagem que a tecla (onUse).
// Medidas em "pixels de HUD" (as da arte processada por tools/assets/process_hud.py; vãos em layout.json).

const ART = urls(import.meta.glob<string>("../../assets/ui/hud/*.png", { eager: true, query: "?url", import: "default" }));
const ICONS = urls(import.meta.glob<string>("../../assets/ui/hud/items/*.png", { eager: true, query: "?url", import: "default" }));

function urls(files: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -".png".length), url]));
}

export interface HudSlot {
  item: string;
  count: number;
}

// O que o HUD mostra. Na cidade não há vida nem fome: chegam cheias (é assim que se entra na caverna).
export interface HudView {
  name: string;
  classId: string;
  level: number;
  xp: number;
  nextLevelXp?: number;
  essences: number;
  hp: number;
  maxHp: number;
  // Undefined na cidade.
  hunger?: number;
  inventory: readonly (HudSlot | undefined)[];
}

const KEY_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
const DOCK_SLOTS = 6;
const SLOT = 48; // moldura de raridade e slot da mochila
const MARGIN = 6;
const NOTICE_MS = 2500;
const MAX_NOTICES = 3;
const HUNGER_ALERT = 0.2;
// Barra fantasma: depois de levar dano, a parte perdida fica clara por GHOST_HOLD_MS e então escorre.
const GHOST_HOLD_MS = 350;
const GHOST_SPEED = 0.6; // fração da barra por segundo
const RARITY_NAMES: Record<Rarity, string> = { common: "comum", rare: "raro", epic: "épico", legendary: "lendário" };
const BAG_KEYS = new Set(["KeyI", "Tab"]);

// Escala inteira: a tela tem pelo menos ~960x540 pixels de HUD (1 em 1366x768, 2 em 1920x1080, 3 em 4K).
function hudScale(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / 960, window.innerHeight / 540)));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent?.append(node);
  return node;
}

function place<T extends HTMLElement>(node: T, x: number, y: number, w?: number, h?: number): T {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  if (w !== undefined) node.style.width = `${w}px`;
  if (h !== undefined) node.style.height = `${h}px`;
  return node;
}

// Só tamanho: a posição dos blocos presos a um canto vem do CSS.
function size<T extends HTMLElement>(node: T, w: number, h: number): T {
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
  return node;
}

function image(name: string, className: string, parent: HTMLElement): HTMLImageElement {
  const img = el("img", className, parent);
  img.src = ART.get(name) ?? "";
  img.alt = "";
  img.draggable = false;
  return img;
}

// Um slot clicável: moldura de raridade, ícone, tecla e quantidade. Igual na barra e na mochila.
class SlotView {
  readonly root: HTMLButtonElement;
  private readonly frame: HTMLImageElement;
  private readonly icon: HTMLImageElement;
  private readonly label: HTMLSpanElement;
  private readonly count: HTMLSpanElement;
  private shown = "";

  constructor(parent: HTMLElement, index: number, onUse: (slot: number) => void, private readonly emptyFrame: boolean) {
    this.root = el("button", "hud-slot", parent);
    this.root.type = "button";
    this.frame = image("slot_common", "hud-slot-frame", this.root);
    this.icon = el("img", "hud-slot-icon", this.root);
    this.icon.alt = "";
    this.icon.draggable = false;
    this.label = el("span", "hud-slot-sigla", this.root);
    el("span", "hud-slot-key", this.root).textContent = KEY_LABELS[index] ?? "";
    this.count = el("span", "hud-slot-count", this.root);
    this.root.addEventListener("click", () => onUse(index));
    this.set(undefined);
  }

  set(slot: HudSlot | undefined) {
    const key = slot ? `${slot.item}:${slot.count}` : "";
    if (key === this.shown) return;
    this.shown = key;
    const stats = slot ? ITEMS[slot.item as ItemId] : undefined;
    this.root.classList.toggle("hud-empty", !stats);
    this.frame.src = ART.get(`slot_${stats?.rarity ?? "common"}`) ?? "";
    this.frame.hidden = !stats && !this.emptyFrame;
    const icon = stats ? ICONS.get(slot?.item ?? "") : undefined;
    this.icon.hidden = !icon;
    if (icon) this.icon.src = icon;
    // Item sem ícone desenhado: a sigla, como no HUD antigo.
    this.label.textContent = stats && !icon ? stats.name.slice(0, 3) : "";
    this.count.textContent = slot && slot.count > 1 ? `x${slot.count}` : "";
    this.root.title = stats && slot ? `${stats.name} (${RARITY_NAMES[stats.rarity]}) ×${slot.count}` : "Vazio";
  }
}

export class Hud {
  private readonly root = el("div", "hud");
  private readonly portrait: HTMLImageElement;
  private readonly fills = new Map<string, HTMLDivElement>();
  private readonly ghost: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly hungerIcon: HTMLImageElement;
  private readonly nameText: HTMLSpanElement;
  private readonly levelText: HTMLSpanElement;
  private readonly essenceText: HTMLSpanElement;
  private readonly notices: HTMLDivElement;
  private readonly hintText: HTMLDivElement;
  private readonly bag: HTMLDivElement;
  private readonly dockSlots: SlotView[] = [];
  private readonly bagSlots: SlotView[] = [];
  private readonly shownWidths = new Map<string, string>();
  private ghostFraction = 1;
  private lastHpFraction = 1;
  private lastDropAt = -Infinity;
  private lastTime = 0;
  private classId = "";

  constructor(onUse: (slot: number) => void) {
    document.body.append(this.root);
    this.root.hidden = true;

    // Canto superior esquerdo: moldura com retrato, as 3 calhas, ícones e a plaqueta com nome e nível.
    const status = el("div", "hud-status", this.root);
    const frame = layout.status_frame;
    size(status, frame.w + 60, frame.h + 22);
    image("status_frame", "hud-abs", status);
    const p = layout.portrait;
    this.portrait = place(image("portrait-mago", "hud-abs hud-portrait", status), p.x, p.y, p.w, p.h);
    this.ghost = el("div", "hud-ghost");
    this.bar(status, "hp").gutter.prepend(this.ghost);
    this.bar(status, "mp");
    this.hungerIcon = this.bar(status, "hunger").icon;
    const hp = layout.gutters.hp;
    this.hpText = place(el("span", "hud-abs hud-bar-text", status), hp.x, hp.y - 1, hp.w, hp.h + 2);
    const plaque = place(el("div", "hud-abs hud-plaque", status), 4, frame.h + 1);
    this.nameText = el("span", "hud-name", plaque);
    this.levelText = el("span", "hud-badge", plaque);
    this.essenceText = el("span", "hud-badge", plaque);

    // Topo, no centro: avisos que somem sozinhos e a dica fixa (portal, extração).
    const top = el("div", "hud-top", this.root);
    this.hintText = el("div", "hud-hint", top);
    this.notices = el("div", "hud-notices", top);

    // Embaixo, no centro: barra rápida com os slots 1 a 6.
    const dock = el("div", "hud-dock", this.root);
    const d = layout.hotbar_dock;
    size(dock, d.w, d.h);
    image("hotbar_dock", "hud-abs", dock);
    layout.dock_slots.slice(0, DOCK_SLOTS).forEach((rect, i) => {
      const slot = new SlotView(dock, i, onUse, false);
      place(slot.root, rect.x + (rect.w - SLOT) / 2, rect.y + (rect.h - SLOT) / 2, SLOT, SLOT);
      this.dockSlots.push(slot);
    });
    const bagButton = place(el("button", "hud-abs hud-bag-button", dock), d.w + 4, d.h / 2 - 9);
    bagButton.textContent = "[I / Tab] Mochila";
    bagButton.addEventListener("click", () => this.toggleBag());

    // Mochila: painel com os 12 slots no couro e, ao lado, os 6 de equipamento (ainda sem equipamento no jogo).
    this.bag = el("div", "hud-bag", this.root);
    this.bag.hidden = true;
    const panel = layout.inv_panel;
    size(this.bag, panel.w + SLOT + 10, panel.h);
    image("inv_panel", "hud-abs", this.bag);
    const title = place(el("div", "hud-abs hud-bag-title", this.bag), 0, layout.leather.y - 22, panel.w);
    title.textContent = "Mochila";
    const leather = layout.leather;
    const cols = 3;
    const rows = Math.ceil(INVENTORY_SLOTS / cols);
    const gapX = (leather.w - cols * SLOT) / (cols - 1);
    const gapY = (leather.h - rows * SLOT) / (rows - 1);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = new SlotView(this.bag, i, onUse, true);
      const col = i % cols;
      const row = Math.floor(i / cols);
      place(slot.root, Math.round(leather.x + col * (SLOT + gapX)), Math.round(leather.y + row * (SLOT + gapY)), SLOT, SLOT);
      this.bagSlots.push(slot);
    }
    const equipTop = (panel.h - 6 * SLOT - 5 * 4) / 2;
    ["equip_helm", "equip_chest", "equip_weapon", "equip_shield", "equip_boots", "equip_ring"].forEach((name, i) => {
      const equip = place(image(name, "hud-abs hud-equip", this.bag), panel.w + 10, equipTop + i * (SLOT + 4), SLOT, SLOT);
      equip.title = "Equipamento: ainda não existe no jogo";
    });

    window.addEventListener("resize", () => this.applyScale());
    window.addEventListener("keydown", (event) => this.onKey(event));
    this.applyScale();
  }

  // Uma calha: o preenchimento (tira da cor da barra, revelada pela largura) e o ícone logo depois da ponta.
  private bar(status: HTMLElement, key: "hp" | "mp" | "hunger") {
    const g = layout.gutters[key];
    const gutter = place(el("div", "hud-abs hud-gutter", status), g.x, g.y, g.w, g.h);
    const fill = el("div", `hud-fill hud-fill-${key}`, gutter);
    fill.style.backgroundImage = `url(${ART.get(`bar_${key}`)})`;
    this.fills.set(key, fill);
    const icon = place(image(`icon_${key}`, "hud-abs hud-bar-icon", status), layout.status_frame.w + 2, g.y + g.h / 2 - 7);
    return { gutter, icon };
  }

  show() {
    this.root.hidden = false;
  }

  // Some nas telas que cobrem o jogo (ficha, morte, extração). A mochila fecha junto.
  hide() {
    this.root.hidden = true;
    this.bag.hidden = true;
    this.hint("");
  }

  // Aviso temporário (primeira morte, slot de essência cheio...). Os mais antigos saem se acumular.
  notice(text: string) {
    const node = el("div", "hud-notice", this.notices);
    node.textContent = text;
    while (this.notices.children.length > MAX_NOTICES) this.notices.firstElementChild?.remove();
    window.setTimeout(() => node.classList.add("hud-fading"), NOTICE_MS - 400);
    window.setTimeout(() => node.remove(), NOTICE_MS);
  }

  // Dica fixa no topo enquanto valer (portal, contagem da extração). Texto vazio esconde.
  hint(text: string) {
    if (this.hintText.textContent !== text) this.hintText.textContent = text;
    this.hintText.hidden = text === "";
  }

  update(view: HudView, time: number) {
    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (view.classId !== this.classId) {
      this.classId = view.classId;
      this.portrait.src = ART.get(`portrait-${view.classId}`) ?? ART.get("portrait-mago") ?? "";
    }
    this.setText(this.nameText, view.name);
    this.setText(this.levelText, `Nv. ${view.level}`);
    this.levelText.title = view.nextLevelXp === undefined ? `XP ${view.xp} (nível máximo)` : `XP ${view.xp} / ${view.nextLevelXp}`;
    this.setText(this.essenceText, `Essências: ${view.essences}/${view.level}`);

    const hp = view.maxHp > 0 ? Math.max(0, view.hp) / view.maxHp : 0;
    if (hp < this.lastHpFraction) this.lastDropAt = time;
    this.lastHpFraction = hp;
    if (hp >= this.ghostFraction) this.ghostFraction = hp;
    else if (time - this.lastDropAt > GHOST_HOLD_MS) this.ghostFraction = Math.max(hp, this.ghostFraction - GHOST_SPEED * dt);
    this.setWidth("hp", this.fills.get("hp"), hp);
    this.setWidth("ghost", this.ghost, this.ghostFraction);
    this.setWidth("mp", this.fills.get("mp"), 1); // recurso de classe: passo 10
    const hunger = view.hunger === undefined ? 1 : view.hunger / HUNGER_MAX;
    this.setWidth("hunger", this.fills.get("hunger"), hunger);
    this.hungerIcon.classList.toggle("hud-alert", hunger < HUNGER_ALERT);
    this.setText(this.hpText, `${Math.ceil(Math.max(0, view.hp))} / ${view.maxHp}`);

    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = view.inventory[i];
      const filled = slot && slot.count > 0 ? slot : undefined;
      this.dockSlots[i]?.set(filled);
      this.bagSlots[i]?.set(filled);
    }
  }

  toggleBag() {
    this.bag.hidden = !this.bag.hidden;
  }

  // I ou Tab abre e fecha a mochila; Esc fecha. Ignora quando se está digitando (campo de nome da ficha).
  private onKey(event: KeyboardEvent) {
    if (this.root.hidden || event.target instanceof HTMLInputElement) return;
    if (BAG_KEYS.has(event.code)) {
      event.preventDefault();
      this.toggleBag();
    } else if (event.code === "Escape") {
      this.bag.hidden = true;
    }
  }

  private applyScale() {
    this.root.style.setProperty("--s", String(hudScale()));
    this.root.style.setProperty("--m", `${MARGIN * hudScale()}px`);
  }

  private setText(node: HTMLElement, text: string) {
    if (node.textContent !== text) node.textContent = text;
  }

  // Largura em % só quando muda (cada mudança de estilo custa um recálculo da página).
  private setWidth(key: string, node: HTMLElement | undefined, fraction: number) {
    const width = `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;
    if (!node || this.shownWidths.get(key) === width) return;
    this.shownWidths.set(key, width);
    node.style.width = width;
  }
}
