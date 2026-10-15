import { HUNGER_MAX, INVENTORY_SLOTS, type BuildingId } from "shared";
import layout from "../../assets/ui/hud/layout.json";
import { GuildWindow, InnWindow, type Send } from "./cityWindows";
import "./hud.css";
import { ART, SlotView, Tooltip, el, image, place, setText, size, type HudSlot } from "./hudParts";
import { InventoryWindow } from "./inventoryWindow";

// HUD em HTML, por cima do jogo (como a ficha de registro): a arte dos kits de interface ampliada por um fator
// inteiro, com pixels nítidos em qualquer janela, livre da luz e do tremor da câmera. Só desenha: os dados chegam
// do jogo a cada quadro (update), e usar um item manda a mesma mensagem que a tecla (onUse).
// Medidas em "pixels de HUD" (as da arte processada por tools/assets/process_hud.py; vãos em layout.json).

export type { HudSlot } from "./hudParts";

// O que o HUD mostra. Na cidade não há vida nem fome: chegam cheias (é assim que se entra na caverna).
export interface HudView {
  name: string;
  classId: string;
  level: number;
  xp: number;
  nextLevelXp?: number;
  // Ids das essências absorvidas, na ordem dos slots.
  essences: readonly string[];
  hp: number;
  maxHp: number;
  // Undefined na cidade.
  hunger?: number;
  // Moedas da linhagem.
  coins: number;
  inventory: readonly (HudSlot | undefined)[];
  // Baú da linhagem: só na cidade.
  stash?: readonly (HudSlot | undefined)[];
}

const DOCK_SLOTS = 6;
const DOCK_FRAME = 48;
const MARGIN = 6;
const NOTICE_MS = 2500;
const MAX_NOTICES = 3;
const HUNGER_ALERT = 0.2;
// Barra fantasma: depois de levar dano, a parte perdida fica clara por GHOST_HOLD_MS e então escorre.
const GHOST_HOLD_MS = 350;
const GHOST_SPEED = 0.6; // fração da barra por segundo
const WINDOW_KEYS = new Set(["KeyI", "Tab", "KeyB"]);

// Escala inteira: a tela tem pelo menos ~960x540 pixels de HUD (1 em 1366x768, 2 em 1920x1080, 3 em 4K).
function hudScale(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / 960, window.innerHeight / 540)));
}

export class Hud {
  private readonly root = el("div", "hud");
  private readonly tooltip: Tooltip;
  private readonly window: InventoryWindow;
  // Janelas dos prédios da cidade (E na porta). No máximo uma janela aberta por vez, contando a de inventário.
  private readonly buildings: Partial<Record<BuildingId, GuildWindow | InnWindow>>;
  private openBuilding: BuildingId | undefined;
  private readonly portrait: HTMLImageElement;
  private readonly fills = new Map<string, HTMLDivElement>();
  private readonly ghost: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly hungerIcon: HTMLImageElement;
  private readonly nameText: HTMLSpanElement;
  private readonly levelText: HTMLSpanElement;
  private readonly essenceText: HTMLSpanElement;
  private readonly coinText: HTMLSpanElement;
  private readonly notices: HTMLDivElement;
  private readonly hintText: HTMLDivElement;
  private readonly dockSlots: SlotView[] = [];
  private readonly shownWidths = new Map<string, string>();
  private ghostFraction = 1;
  private lastHpFraction = 1;
  private lastDropAt = -Infinity;
  private lastTime = 0;
  private classId = "";

  constructor(onUse: (slot: number) => void, send: Send) {
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
    const purse = el("span", "hud-badge hud-purse", plaque);
    image("icon_coin", "hud-coin", purse);
    this.coinText = el("span", "", purse);
    purse.title = "Moedas da linhagem";

    // Topo, no centro: avisos que somem sozinhos e a dica fixa (portal, extração).
    const top = el("div", "hud-top", this.root);
    this.hintText = el("div", "hud-hint", top);
    this.notices = el("div", "hud-notices", top);

    // A dica é do HUD inteiro (fora dos blocos ampliados): fica por cima de tudo e acompanha o mouse.
    this.tooltip = new Tooltip(this.root);

    // Embaixo, no centro: barra rápida com os slots 1 a 6.
    const dock = el("div", "hud-dock", this.root);
    const d = layout.hotbar_dock;
    size(dock, d.w, d.h);
    image("hotbar_dock", "hud-abs", dock);
    layout.dock_slots.slice(0, DOCK_SLOTS).forEach((rect, i) => {
      const slot = new SlotView(dock, i, onUse, this.tooltip, { frameSize: DOCK_FRAME, iconScale: 2, emptyFrame: false });
      place(slot.root, rect.x + (rect.w - DOCK_FRAME) / 2, rect.y + (rect.h - DOCK_FRAME) / 2);
      this.dockSlots.push(slot);
    });
    const windowButton = place(el("button", "hud-abs hud-bag-button", dock), d.w + 4, d.h / 2 - 9);
    windowButton.textContent = "[I] Inventário";
    windowButton.addEventListener("click", () => this.toggleWindow());

    this.window = new InventoryWindow(this.root, this.tooltip, onUse);
    this.buildings = {
      guild: new GuildWindow(this.root, this.tooltip, send),
      inn: new InnWindow(this.root, this.tooltip, send),
    };

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

  // Some nas telas que cobrem o jogo (ficha, morte, extração). A janela fecha junto.
  hide() {
    this.root.hidden = true;
    this.window.close();
    this.closeBuilding();
    this.tooltip.hide();
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
    setText(this.hintText, text);
    this.hintText.hidden = text === "";
  }

  update(view: HudView, time: number) {
    const dt = Math.min(0.1, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (view.classId !== this.classId) {
      this.classId = view.classId;
      this.portrait.src = ART.get(`portrait-${view.classId}`) ?? ART.get("portrait-mago") ?? "";
    }
    setText(this.nameText, view.name);
    setText(this.levelText, `Nv. ${view.level}`);
    this.levelText.title = view.nextLevelXp === undefined ? `XP ${view.xp} (nível máximo)` : `XP ${view.xp} / ${view.nextLevelXp}`;
    setText(this.essenceText, `Essências: ${view.essences.length}/${view.level}`);
    setText(this.coinText, String(view.coins));

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
    setText(this.hpText, `${Math.ceil(Math.max(0, view.hp))} / ${view.maxHp}`);

    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = view.inventory[i];
      this.dockSlots[i]?.set(slot && slot.count > 0 ? slot : undefined);
    }
    // A janela aberta acompanha na hora (comer, pegar loot, absorver essência); fechada, não gasta nada.
    if (this.window.open) this.window.update(view);
    if (this.openBuilding) this.buildings[this.openBuilding]?.update(view);
  }

  toggleWindow() {
    this.closeBuilding();
    this.window.toggle();
    this.tooltip.hide();
  }

  // Qual janela de prédio está aberta (a cena a fecha quando o jogador sai da porta).
  get building(): BuildingId | undefined {
    return this.openBuilding;
  }

  // E na porta: abre a janela do prédio, ou fecha se já estava aberta. A Forja ainda não tem janela.
  toggleBuilding(id: BuildingId) {
    if (this.openBuilding === id) return this.closeBuilding();
    const next = this.buildings[id];
    if (!next) return this.notice("Forja do Ferreiro: em breve.");
    this.closeBuilding();
    this.window.close();
    next.root.hidden = false;
    this.openBuilding = id;
  }

  closeBuilding() {
    if (!this.openBuilding) return;
    const current = this.buildings[this.openBuilding];
    if (current) current.root.hidden = true;
    this.openBuilding = undefined;
    this.tooltip.hide();
  }

  // I, Tab ou B abrem e fecham a janela; Esc fecha. Não mexe nas teclas do jogo (WASD e slots seguem valendo).
  // Ignora quando se está digitando (campo de nome da ficha).
  private onKey(event: KeyboardEvent) {
    if (this.root.hidden || event.target instanceof HTMLInputElement) return;
    if (WINDOW_KEYS.has(event.code)) {
      event.preventDefault();
      this.toggleWindow();
    } else if (event.code === "Escape") {
      this.window.close();
      this.closeBuilding();
      this.tooltip.hide();
    }
  }

  private applyScale() {
    this.root.style.setProperty("--s", String(hudScale()));
    this.root.style.setProperty("--m", `${MARGIN * hudScale()}px`);
  }

  // Largura em % só quando muda (cada mudança de estilo custa um recálculo da página).
  private setWidth(key: string, node: HTMLElement | undefined, fraction: number) {
    const width = `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;
    if (!node || this.shownWidths.get(key) === width) return;
    this.shownWidths.set(key, width);
    node.style.width = width;
  }
}
