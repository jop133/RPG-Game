import {
  HUNGER_MAX,
  INVENTORY_SLOTS,
  ITEMS,
  LEVEL_XP,
  SKILLS,
  type SkillId,
  levelProgress,
  type BuildingId,
  type EquipSlot,
  type ItemId,
  type StationId,
} from "shared";
import layout from "../../assets/ui/hud/layout.json";
import { ForgeWindow, GuildWindow, InnWindow, type CityWindow, type Send } from "./cityWindows";
import "./hud.css";
import { ART, ICONS, SlotView, Tooltip, el, essenceEffectText, frameName, image, place, rarityStyle, setText, setViewerClass, size, type HudSlot } from "./hudParts";
import { EMPTY_SKILL_ICON, SKILL_ICONS, SKILL_KEY_LABELS } from "./skillArt";
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
  // O que está equipado, slot -> id de item (slot ausente = vazio).
  equipment: Partial<Record<EquipSlot, string>>;
  // Só na cidade: baú da linhagem e, para o Bestiário, os tipos mortos pela linhagem e por este personagem.
  stash?: readonly (HudSlot | undefined)[];
  bestiary?: readonly string[];
  kills?: readonly string[];
  // As habilidades nos slots Q e R e quanto falta (ms) da recarga de cada uma (0 fora do labirinto).
  skills: readonly { id: SkillId | null; cooldownMs: number }[];
  // Mana (no labirinto; na cidade, cheia) e a zona hostil em que está (no labirinto; undefined fora delas).
  mana?: number;
  maxMana?: number;
  zone?: string;
}

// Indicador da zona hostil, no topo: o nome da zona e a penalidade que vale agora.
const ZONE_BANNERS: Record<string, { name: string; effect: string; color: string }> = {
  goblin: { name: "Acampamento Goblin", effect: "Breu Abissal: luz −75%", color: "#d9a35b" },
  slime: { name: "Fosso dos Slimes", effect: "Miasma Ácido: cura −30% · lodo corrosivo", color: "#8fd65a" },
  lobo: { name: "Covil dos Lobos", effect: "Frio Cortante: fome 1,75× · Frenesi de Sangue abaixo de 35% de vida", color: "#9fd0ff" },
  gnomo: { name: "Minas dos Gnomos", effect: "Radiação Arcana: −1,5 Mana/s · +25% de dano recebido", color: "#5fe3ff" },
};

// Botões das habilidades (Q e R), à esquerda da barra rápida (como a mochila à direita): o ícone da habilidade do
// slot (ou o do slot vazio), a tecla e a recarga escurecendo de cima para baixo, com os segundos que faltam.
const SKILL_BUTTON = 52;
const SKILL_GAP = 8;

const DOCK_SLOTS = 6;
const DOCK_FRAME = 48;
const MARGIN = 6;
// Bloco de status e barra rápida, em px de tela numa tela de até 1366x768 (--u = 1; cresce em telas maiores, ver
// hudUnit). O anel do retrato é o da arte (status_frame) em 2x; o retrato, em 4x (96 px); as calhas são desenhadas
// em CSS (a da arte tem 7 px de altura e não estica até 24 sem deformar).
const STATUS = { w: 480, h: 182 };
const RING = { w: 172, h: 182, art: 2 }; // as 86 colunas da esquerda do status_frame, em 2x
const PORTRAIT = { x: 48, y: 43, w: 96, h: 92 };
const BARS_X = 222;
const BAR = { w: 250, h: 24 };
const BAR_ROWS = { hp: 40, mp: 74, hunger: 108 };
const ICON = { w: 32, h: 28 };
const ESSENCE_ROW = 144;
const SOCKET = 28;
// Nível = slots de essência desbloqueados; o maior nível é o último limite de LEVEL_XP.
const MAX_ESSENCE_SLOTS = LEVEL_XP.length + 1;
const DOCK_SCALE = 1.5; // vãos de 40 px do dock -> 60 px
// Recurso de classe (barra azul): ainda não existe (passo 10); a barra fica cheia com este texto até lá.
// Anel de XP em volta do medalhão do nível (SVG): raio e espessura do trilho, em px do bloco de status.
// Mesmo centro do medalhão (46 px, em (124, 134)); o traço fica todo por fora dele (raio 23).
const XP_RING = { size: 62, radius: 27, stroke: 5 };
const XP_RING_LENGTH = 2 * Math.PI * XP_RING.radius;
const BAG_BUTTON = 56;
const BAG_GAP = 8;
// Mochila em pixel-art (16x16, cada letra uma cor; "." = vazio), desenhada como SVG.
const BAG_ICON = [
  "......dddd......",
  ".....d....d.....",
  ".....d....d.....",
  "...bbbbbbbbbb...",
  "..bLLLLLLLLLLb..",
  "..bLLLLLLLLLLb..",
  "..bFFFFFFFFFFb..",
  "..bFFFFggFFFFb..",
  "..bLLLLggLLLLb..",
  "..bLLLLLLLLLLb..",
  "..bLLLLLLLLLLb..",
  "..bLLsLLLLsLLb..",
  "..bLLsLLLLsLLb..",
  "..bLLLLLLLLLLb..",
  "...bbbbbbbbbb...",
  "................",
];
const BAG_COLORS: Record<string, string> = { d: "#5a3a22", b: "#2a1a10", L: "#8a5a32", F: "#6b4224", g: "#e2b341", s: "#5a3a22" };
const NOTICE_MS = 2500;
const MAX_NOTICES = 3;
const HUNGER_ALERT = 0.2;
// Barra fantasma: depois de levar dano, a parte perdida fica clara por GHOST_HOLD_MS e então escorre.
const GHOST_HOLD_MS = 350;
const GHOST_SPEED = 0.6; // fração da barra por segundo
const WINDOW_KEYS = new Set(["KeyI", "Tab", "KeyB"]);
// Janela e aba de cada móvel dos prédios.
const STATION_WINDOWS: Record<StationId, [BuildingId, string]> = {
  "guild-counter": ["guild", "merchant"],
  "guild-bestiary": ["guild", "bestiary"],
  "inn-counter": ["inn", "tavern"],
  "inn-chest": ["inn", "stash"],
  "blacksmith-counter": ["blacksmith", "catalog"],
  "blacksmith-anvil": ["blacksmith", "recipes"],
};

// Escala inteira das janelas: a tela tem pelo menos ~960x540 pixels de HUD (1 em 1366x768, 2 em 1920x1080, 3 em 4K).
function hudScale(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / 960, window.innerHeight / 540)));
}

// Escala do status e da barra rápida: 1 até 1366x768, crescendo em passos de 1/4 (1,25 em 1920x1080).
function hudUnit(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / 1366, window.innerHeight / 768) * 4) / 4);
}

function bagIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.classList.add("hud-bag-icon");
  BAG_ICON.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const color = BAG_COLORS[c];
      if (!color) return;
      const r = document.createElementNS(ns, "rect");
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", "1");
      r.setAttribute("height", "1");
      r.setAttribute("fill", color);
      svg.append(r);
    }),
  );
  return svg;
}

function xpRing(parent: HTMLElement, x: number, y: number): SVGCircleElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${XP_RING.size} ${XP_RING.size}`);
  svg.classList.add("hud-abs", "hud-xp-ring");
  svg.style.left = `${x}px`;
  svg.style.top = `${y}px`;
  svg.style.width = svg.style.height = `${XP_RING.size}px`;
  const circle = (className: string) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", String(XP_RING.size / 2));
    c.setAttribute("cy", String(XP_RING.size / 2));
    c.setAttribute("r", String(XP_RING.radius));
    c.setAttribute("class", className);
    svg.append(c);
    return c;
  };
  circle("hud-xp-track");
  const arc = circle("hud-xp-arc");
  arc.setAttribute("stroke-dasharray", String(XP_RING_LENGTH));
  arc.setAttribute("stroke-dashoffset", String(XP_RING_LENGTH));
  parent.append(svg);
  return arc;
}

interface Socket {
  box: HTMLDivElement;
  frame: HTMLImageElement;
  icon: HTMLImageElement;
}

export class Hud {
  private readonly root = el("div", "hud");
  private readonly tooltip: Tooltip;
  private readonly window: InventoryWindow;
  // Janelas dos prédios da cidade (E na porta). No máximo uma janela aberta por vez, contando a de inventário.
  private readonly buildings: Record<BuildingId, CityWindow>;
  private openStation: StationId | undefined;
  private readonly portrait: HTMLImageElement;
  private readonly fills = new Map<string, HTMLDivElement>();
  private readonly ghost: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly hungerText: HTMLSpanElement;
  private readonly xpArc: SVGCircleElement;
  private xpTooltip = "";
  private readonly hungerIcon: HTMLImageElement;
  private readonly nameText: HTMLSpanElement;
  private readonly levelText: HTMLSpanElement;
  private readonly essenceText: HTMLSpanElement;
  private readonly sockets: Socket[] = [];
  private shownEssences = "";
  private essenceView: { level: number; essences: readonly string[] } = { level: 1, essences: [] };
  private readonly coinText: HTMLSpanElement;
  private readonly notices: HTMLDivElement;
  private readonly hintText: HTMLDivElement;
  private readonly mpText: HTMLSpanElement;
  private readonly zoneBanner: HTMLDivElement;
  private readonly zoneName: HTMLDivElement;
  private readonly zoneEffect: HTMLDivElement;
  private readonly dockSlots: SlotView[] = [];
  private readonly skillIcons: HTMLImageElement[] = [];
  private readonly skillShades: HTMLDivElement[] = [];
  private readonly skillTimes: HTMLSpanElement[] = [];
  private skillView: HudView["skills"] = [];
  // A barra rápida some com a mochila aberta: os mesmos slots estão no cinturão da janela.
  private readonly dockbar: HTMLDivElement;
  private readonly shownWidths = new Map<string, string>();
  private ghostFraction = 1;
  private lastHpFraction = 1;
  private lastDropAt = -Infinity;
  private lastTime = 0;
  private classId = "";

  constructor(onUse: (slot: number) => void, send: Send) {
    document.body.append(this.root);
    this.root.hidden = true;

    // Canto superior esquerdo: o anel gótico com o retrato e o medalhão do nível; à direita, a placa com o nome, as 3
    // calhas (ícone, barra, texto) e a fileira de engastes de essência com a bolsa de moedas.
    this.tooltip = new Tooltip(this.root);
    const status = size(el("div", "hud-status", this.root), STATUS.w, STATUS.h);
    const ring = place(el("div", "hud-abs hud-ring", status), 0, 0, RING.w, RING.h);
    ring.style.backgroundImage = `url(${ART.get("status_frame")})`;
    ring.style.backgroundSize = `${layout.status_frame.w * RING.art}px ${layout.status_frame.h * RING.art}px`;
    this.portrait = place(image("portrait-mago", "hud-abs hud-portrait", status), PORTRAIT.x, PORTRAIT.y, PORTRAIT.w, PORTRAIT.h);
    // Medalhão do nível com o anel de XP em volta: trilho escuro e o arco dourado, que enche do topo em sentido
    // horário com o progresso dentro do nível (levelProgress).
    this.xpArc = xpRing(status, 124 + 23 - XP_RING.size / 2, 134 + 23 - XP_RING.size / 2);
    const medal = place(el("div", "hud-abs hud-level", status), 124, 134, 46, 46);
    this.levelText = el("span", "", medal);
    this.tooltip.attach(medal, () => ({ title: this.xpTooltip, lines: [] }));
    const nameplate = place(el("div", "hud-abs hud-nameplate", status), BARS_X - 40, 6, BAR.w + 48, 28);
    this.nameText = el("span", "", nameplate);
    const hp = this.bar(status, "hp");
    hp.trough.prepend(this.ghost = el("div", "hud-ghost"));
    this.hpText = hp.text;
    this.mpText = this.bar(status, "mp").text;
    const hunger = this.bar(status, "hunger");
    this.hungerIcon = hunger.icon;
    this.hungerText = hunger.text;
    const row = place(el("div", "hud-abs hud-essence-row", status), BARS_X - 40, ESSENCE_ROW, BAR.w + 48, SOCKET);
    for (let i = 0; i < MAX_ESSENCE_SLOTS; i++) this.sockets.push(this.socket(row, i));
    this.essenceText = el("span", "hud-essence-label", row);
    const purse = el("span", "hud-purse", row);
    image("icon_coin", "hud-coin", purse);
    this.coinText = el("span", "", purse);
    this.tooltip.attach(purse, () => ({ title: "Moedas da linhagem", lines: [`${this.coinText.textContent} moedas`] }));

    // Topo, no centro: avisos que somem sozinhos e a dica fixa (portal, extração).
    const top = el("div", "hud-top", this.root);
    this.zoneBanner = el("div", "hud-zone", top);
    this.zoneName = el("div", "hud-zone-name", this.zoneBanner);
    this.zoneEffect = el("div", "hud-zone-effect", this.zoneBanner);
    this.zoneBanner.hidden = true;
    this.hintText = el("div", "hud-hint", top);
    this.notices = el("div", "hud-notices", top);

    // Embaixo, no centro: barra rápida com os slots 1 a 6 (o dock da arte em 1,5x) e o botão da mochila ao lado.
    const d = layout.hotbar_dock;
    const dockbar = (this.dockbar = size(el("div", "hud-dockbar", this.root), d.w * DOCK_SCALE + BAG_GAP + BAG_BUTTON, d.h * DOCK_SCALE));
    const dock = size(el("div", "hud-abs hud-dock", dockbar), d.w, d.h);
    image("hotbar_dock", "hud-abs", dock);
    layout.dock_slots.slice(0, DOCK_SLOTS).forEach((rect, i) => {
      const slot = new SlotView(dock, i, onUse, this.tooltip, { frameSize: DOCK_FRAME, iconScale: 2, emptyFrame: false });
      place(slot.root, rect.x + (rect.w - DOCK_FRAME) / 2, rect.y + (rect.h - DOCK_FRAME) / 2);
      this.dockSlots.push(slot);
    });
    const bag = place(el("button", "hud-abs hud-bag", dockbar), d.w * DOCK_SCALE + BAG_GAP, (d.h * DOCK_SCALE - BAG_BUTTON) / 2, BAG_BUTTON, BAG_BUTTON);
    bag.type = "button";
    bag.style.backgroundImage = `url(${ART.get("slot_legendary")})`;
    bag.append(bagIcon());
    el("span", "hud-bag-key", bag).textContent = "I";
    el("span", "hud-bag-label", bag).textContent = "Mochila";
    bag.addEventListener("click", () => this.toggleWindow());
    const skillBar = place(el("div", "hud-abs hud-spellbar", dockbar), -(SKILL_BUTTON + SKILL_GAP) * SKILL_KEY_LABELS.length, 0);
    SKILL_KEY_LABELS.forEach((key, i) => {
      const top = (d.h * DOCK_SCALE - SKILL_BUTTON) / 2;
      const button = place(el("div", "hud-abs hud-spell", skillBar), i * (SKILL_BUTTON + SKILL_GAP), top, SKILL_BUTTON, SKILL_BUTTON);
      const icon = el("img", "hud-spell-icon", button);
      icon.src = EMPTY_SKILL_ICON;
      icon.alt = "";
      icon.draggable = false;
      this.skillIcons.push(icon);
      this.skillShades.push(el("div", "hud-spell-shade", button));
      this.skillTimes.push(el("span", "hud-spell-time", button));
      el("span", "hud-spell-key", button).textContent = key;
      this.tooltip.attach(button, () => {
        const id = this.skillView[i]?.id;
        if (!id) return { title: `Slot [${key}] vazio`, lines: ["Equipe uma habilidade na aba Skills da mochila."], hint: "Mochila [I] → Skills" };
        const skill = SKILLS[id];
        return { title: skill.name, subtitle: `Recarga ${skill.cooldownMs / 1000} s`, lines: [skill.description, "Mira no mouse."], hint: `Pressione [${key}]` };
      });
    });
    this.tooltip.attach(bag, () => ({ title: "Mochila", lines: ["Inventário, essências e equipamento."], hint: "Clique ou pressione [I]" }));

    this.window = new InventoryWindow(this.root, this.tooltip, onUse, send, () => this.closeWindow());
    this.buildings = {
      guild: new GuildWindow(this.root, this.tooltip, send),
      inn: new InnWindow(this.root, this.tooltip, send),
      blacksmith: new ForgeWindow(this.root, this.tooltip, send),
    };

    window.addEventListener("resize", () => this.applyScale());
    window.addEventListener("keydown", (event) => this.onKey(event));
    this.applyScale();
  }

  // Uma calha: ícone à esquerda, calha de ferro com ponta, o preenchimento (a tira da cor da barra, revelada pela
  // largura), um brilho no topo e o texto no meio.
  private bar(status: HTMLElement, key: "hp" | "mp" | "hunger") {
    const y = BAR_ROWS[key];
    const icon = place(image(`icon_${key}`, "hud-abs hud-bar-icon", status), BARS_X - ICON.w - 6, y + (BAR.h - ICON.h) / 2, ICON.w, ICON.h);
    const frame = place(el("div", "hud-abs hud-trough-frame", status), BARS_X, y, BAR.w, BAR.h);
    const trough = el("div", "hud-trough", frame);
    const fill = el("div", `hud-fill hud-fill-${key}`, trough);
    fill.style.backgroundImage = `url(${ART.get(`bar_${key}`)})`;
    this.fills.set(key, fill);
    el("div", "hud-shine", trough);
    const text = el("span", "hud-bar-text", frame);
    return { trough, icon, text };
  }

  // Engaste de essência: comum quando livre, a moldura da raridade com o ícone quando ocupado; só os desbloqueados
  // pelo nível aparecem. A dica é a mesma da janela de inventário.
  private socket(row: HTMLElement, index: number): Socket {
    const box = size(el("div", "hud-socket", row), SOCKET, SOCKET);
    const frame = size(image(frameName("common", SOCKET), "hud-abs", box), SOCKET, SOCKET);
    const icon = place(el("img", "hud-abs", box), 6, 6, 16, 16);
    icon.alt = "";
    icon.draggable = false;
    this.tooltip.attach(box, () => {
      const item = this.essenceView.essences[index];
      const stats = item ? (ITEMS[item as ItemId] as (typeof ITEMS)[ItemId] | undefined) : undefined;
      if (!stats || !("essence" in stats)) return { title: "Engaste livre", lines: ["Consuma uma essência para ocupá-lo."] };
      const rarity = rarityStyle(stats.rarity);
      return {
        title: `${stats.name}: ${essenceEffectText(stats.essence)}`,
        titleColor: rarity.color,
        subtitle: rarity.name,
        lines: ["Bônus ativo.", "Só pode ser removida via Purificação na Igreja."],
      };
    });
    return { box, frame, icon };
  }

  private updateSockets(level: number, essences: readonly string[]) {
    this.essenceView = { level, essences };
    const key = `${level}:${essences.join(",")}`;
    if (key === this.shownEssences) return;
    this.shownEssences = key;
    this.sockets.forEach((socket, i) => {
      const item = essences[i];
      const stats = item ? (ITEMS[item as ItemId] as (typeof ITEMS)[ItemId] | undefined) : undefined;
      socket.box.hidden = i >= level;
      socket.frame.src = ART.get(frameName(stats?.rarity ?? "common", SOCKET)) ?? "";
      socket.icon.hidden = !stats;
      if (item) socket.icon.src = ICONS.get(item) ?? "";
    });
  }

  show() {
    this.root.hidden = false;
  }

  // Some nas telas que cobrem o jogo (ficha, morte, extração). A janela fecha junto.
  hide() {
    this.root.hidden = true;
    this.closeWindow();
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
      setViewerClass(view.classId);
      this.portrait.src = ART.get(`portrait-${view.classId}`) ?? ART.get("portrait-mago") ?? "";
    }
    setText(this.nameText, view.name);
    setText(this.levelText, `Nv. ${view.level}`);
    const xp = levelProgress(view.level, view.xp);
    const offset = (XP_RING_LENGTH * (1 - xp.progress)).toFixed(2);
    if (this.xpArc.getAttribute("stroke-dashoffset") !== offset) this.xpArc.setAttribute("stroke-dashoffset", offset);
    this.xpTooltip =
      xp.xpNext === undefined
        ? `Nível ${view.level} — XP: ${view.xp} (nível máximo)`
        : `Nível ${view.level} — XP: ${view.xp} / ${xp.xpNext} para o Nv. ${view.level + 1}`;
    setText(this.essenceText, `Essências (${view.essences.length}/${view.level})`);
    this.updateSockets(view.level, view.essences);
    setText(this.coinText, String(view.coins));

    const hp = view.maxHp > 0 ? Math.max(0, view.hp) / view.maxHp : 0;
    if (hp < this.lastHpFraction) this.lastDropAt = time;
    this.lastHpFraction = hp;
    if (hp >= this.ghostFraction) this.ghostFraction = hp;
    else if (time - this.lastDropAt > GHOST_HOLD_MS) this.ghostFraction = Math.max(hp, this.ghostFraction - GHOST_SPEED * dt);
    this.setWidth("hp", this.fills.get("hp"), hp);
    this.setWidth("ghost", this.ghost, this.ghostFraction);
    const maxMana = view.maxMana ?? 100;
    const mana = view.mana ?? maxMana;
    this.setWidth("mp", this.fills.get("mp"), maxMana > 0 ? Math.max(0, mana) / maxMana : 0);
    setText(this.mpText, `${Math.floor(Math.max(0, mana))} / ${maxMana}`);
    const banner = view.zone ? ZONE_BANNERS[view.zone] : undefined;
    this.zoneBanner.hidden = !banner;
    if (banner) {
      setText(this.zoneName, banner.name);
      setText(this.zoneEffect, banner.effect);
      this.zoneName.style.color = banner.color;
    }
    const hunger = view.hunger === undefined ? 1 : view.hunger / HUNGER_MAX;
    this.setWidth("hunger", this.fills.get("hunger"), hunger);
    this.hungerIcon.classList.toggle("hud-alert", hunger < HUNGER_ALERT);
    setText(this.hungerText, `${Math.round(hunger * 100)}%`);
    setText(this.hpText, `${Math.ceil(Math.max(0, view.hp))} / ${view.maxHp}`);

    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = view.inventory[i];
      this.dockSlots[i]?.set(slot && slot.count > 0 ? slot : undefined);
    }
    this.updateSkills(view.skills);
    // A janela aberta acompanha na hora (comer, pegar loot, absorver essência); fechada, não gasta nada.
    if (this.window.open) this.window.update(view);
    if (this.openStation) this.buildings[STATION_WINDOWS[this.openStation][0]].update(view);
  }

  // Ícone de cada slot e a recarga: a sombra cobre a fração que falta, e os segundos aparecem enquanto não está pronta.
  private updateSkills(skills: HudView["skills"]) {
    this.skillView = skills;
    this.skillIcons.forEach((icon, i) => {
      const slot = skills[i];
      const src = slot?.id ? SKILL_ICONS[slot.id] : EMPTY_SKILL_ICON;
      if (icon.getAttribute("src") !== src) icon.src = src;
      const left = slot?.id ? slot.cooldownMs : 0;
      const total = slot?.id ? SKILLS[slot.id].cooldownMs : 1;
      const shade = this.skillShades[i];
      if (shade) shade.style.height = `${Math.min(100, (100 * left) / total)}%`;
      const time = this.skillTimes[i];
      if (time) setText(time, left > 0 ? `${Math.ceil(left / 1000)}` : "");
    });
  }

  toggleWindow() {
    this.closeBuilding();
    this.window.toggle();
    this.dockbar.hidden = this.window.open;
    this.tooltip.hide();
  }

  closeWindow() {
    this.window.close();
    this.dockbar.hidden = false;
    this.tooltip.hide();
  }

  // Qual móvel está com a janela aberta (a cena a fecha quando o jogador se afasta dele).
  get station(): StationId | undefined {
    return this.openStation;
  }

  // E num móvel: abre a janela dele, na aba dele, ou fecha se já estava aberta.
  toggleStation(id: StationId) {
    if (this.openStation === id) return this.closeBuilding();
    this.closeBuilding();
    this.closeWindow();
    const [building, tab] = STATION_WINDOWS[id];
    this.buildings[building].show(tab);
    this.buildings[building].root.hidden = false;
    this.openStation = id;
  }

  closeBuilding() {
    if (!this.openStation) return;
    this.buildings[STATION_WINDOWS[this.openStation][0]].root.hidden = true;
    this.openStation = undefined;
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
      this.closeWindow();
      this.closeBuilding();
      this.tooltip.hide();
    }
  }

  private applyScale() {
    this.root.style.setProperty("--s", String(hudScale()));
    this.root.style.setProperty("--m", `${MARGIN * hudScale()}px`);
    this.root.style.setProperty("--u", String(hudUnit()));
  }

  // Largura em % só quando muda (cada mudança de estilo custa um recálculo da página).
  private setWidth(key: string, node: HTMLElement | undefined, fraction: number) {
    const width = `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;
    if (!node || this.shownWidths.get(key) === width) return;
    this.shownWidths.set(key, width);
    node.style.width = width;
  }
}
