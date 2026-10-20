import { INVENTORY_SLOTS } from "shared";
import { el, setText } from "./hudParts";

// Placas do HUD em ferro negro rebitado, bronze e couro (só desenho; o que acontece é decidido pelo servidor):
// - InteractionPlate: a placa de proximidade, acima da barra rápida: a tecla [E] como uma tecla física de bronze, o
//   título da ação e um subtítulo curto (portal, portas, balcões, tocha; sem tecla, a contagem da extração);
// - Toasts: os avisos no centro-superior, como placas góticas com divisória dourada e um ícone pelo tipo;
// - PortalModal: a confirmação de entrada no labirinto, com o resumo de prontidão e os botões [E] e [Esc].

// ---------------------------------------------------------------- placa de interação

export interface Prompt {
  // Tecla da ação ("E"); sem tecla, a placa só informa (contagem da extração).
  key?: string;
  title: string;
  subtitle?: string;
  // Arcano: o subtítulo em púrpura (o portal).
  arcane?: boolean;
}

export class InteractionPlate {
  private readonly root: HTMLDivElement;
  private readonly key: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private shown = "";

  constructor(parent: HTMLElement) {
    this.root = el("div", "hud-prompt", parent);
    this.root.hidden = true;
    this.key = el("div", "hud-keycap", this.root);
    const text = el("div", "hud-prompt-text", this.root);
    this.title = el("div", "hud-prompt-title", text);
    this.subtitle = el("div", "hud-prompt-subtitle", text);
    for (const corner of ["tl", "tr", "bl", "br"]) el("span", `hud-plate-corner hud-plate-corner-${corner}`, this.root);
  }

  // Mostra a placa (ou esconde, sem nada). Só mexe na página quando muda; uma placa nova entra com a animação.
  set(prompt: Prompt | undefined) {
    const id = prompt ? `${prompt.key ?? ""}|${prompt.title}|${prompt.subtitle ?? ""}|${prompt.arcane ? 1 : 0}` : "";
    if (id === this.shown) return;
    const fresh = !this.shown || this.shown.split("|")[1] !== prompt?.title;
    this.shown = id;
    this.root.hidden = !prompt;
    if (!prompt) return;
    this.key.hidden = !prompt.key;
    setText(this.key, prompt.key ?? "");
    setText(this.title, prompt.title);
    setText(this.subtitle, prompt.subtitle ?? "");
    this.subtitle.hidden = !prompt.subtitle;
    this.subtitle.classList.toggle("hud-prompt-arcane", Boolean(prompt.arcane));
    if (fresh) restartAnimation(this.root, "hud-plate-in");
  }
}

// ---------------------------------------------------------------- avisos

export type NoticeKind = "info" | "warning" | "coin" | "xp" | "zone";
const NOTICE_ICONS: Record<NoticeKind, string> = { info: "◆", warning: "!", coin: "◉", xp: "✦", zone: "◈" };
const NOTICE_MS = 2800;
const MAX_NOTICES = 3;

// O tipo de um aviso que veio só como texto (do servidor), pelo começo e pelas palavras dele.
export function noticeKind(text: string): NoticeKind {
  if (/^(Vendeu|Comprou|Pagou|Guardou|Retirou)/.test(text)) return "coin";
  if (/^Primeira morte|nível/.test(text)) return "xp";
  if (/cheia|cheio|insuficientes|Apenas|não |Não |Sem slot|Moedas/.test(text)) return "warning";
  return "info";
}

export class Toasts {
  constructor(private readonly parent: HTMLElement) {}

  show(text: string, kind: NoticeKind = noticeKind(text)) {
    const node = el("div", `hud-toast hud-toast-${kind}`, this.parent);
    el("div", "hud-toast-rule", node).textContent = "─── ◆ ───";
    const row = el("div", "hud-toast-row", node);
    el("span", "hud-toast-icon", row).textContent = NOTICE_ICONS[kind];
    el("span", "hud-toast-text", row).textContent = text;
    restartAnimation(node, "hud-plate-in");
    while (this.parent.querySelectorAll(".hud-toast").length > MAX_NOTICES) this.parent.querySelector(".hud-toast")?.remove();
    window.setTimeout(() => node.classList.add("hud-fading"), NOTICE_MS - 450);
    window.setTimeout(() => node.remove(), NOTICE_MS);
  }
}

// ---------------------------------------------------------------- portal

export interface PortalView {
  maxHp: number;
  inventory: readonly ({ item: string; count: number } | undefined)[];
}

// A confirmação do portal da cidade: [E] (ou o botão) entra; [Esc] (ou o botão) recua. Na cidade não há vida nem
// fome: o resumo mostra com o que o personagem entra (vida cheia, fome cheia) e o quanto a mochila já leva.
export class PortalModal {
  readonly root: HTMLDivElement;
  private readonly backdrop: HTMLDivElement;
  private readonly hp: HTMLSpanElement;
  private readonly hunger: HTMLSpanElement;
  private readonly bag: HTMLSpanElement;
  private readonly bagNote: HTMLSpanElement;

  constructor(parent: HTMLElement, private readonly onEnter: () => void, onBack: () => void) {
    this.backdrop = el("div", "hud-shop-backdrop", parent);
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", onBack);
    this.root = el("div", "hud-window hud-portal", parent);
    this.root.hidden = true;
    for (const corner of ["tl", "tr", "bl", "br"]) el("span", `hud-plate-corner hud-plate-corner-${corner}`, this.root);
    el("div", "hud-portal-title", this.root).textContent = "Portal do Labirinto";
    el("div", "hud-portal-rule", this.root).textContent = "─── ◆ ───";
    el("div", "hud-portal-text", this.root).textContent =
      "Além do véu, a escuridão respira. Goblins no breu, lodo ácido dos slimes, o frio dos lobos e os cristais que " +
      "queimam a mente nas minas dos gnomos. Só volta quem extrai vivo — e só fica o que você trouxer de volta.";
    const badges = el("div", "hud-portal-badges", this.root);
    const badge = (label: string) => {
      const box = el("div", "hud-portal-badge", badges);
      el("div", "hud-portal-badge-label", box).textContent = label;
      const value = el("span", "hud-portal-badge-value", box);
      return { box, value };
    };
    this.hp = badge("Vida").value;
    this.hunger = badge("Fome").value;
    const bag = badge("Mochila");
    this.bag = bag.value;
    this.bagNote = el("span", "hud-portal-badge-note", bag.box);
    el("div", "hud-portal-note", this.root).textContent = "Você entra com a vida e a fome cheias.";
    const buttons = el("div", "hud-portal-buttons", this.root);
    const enter = el("button", "hud-gothic-btn hud-gothic-primary", buttons);
    enter.type = "button";
    enter.innerHTML = `<span class="hud-keycap hud-keycap-small">E</span> Adentrar o Labirinto`;
    enter.addEventListener("click", () => this.onEnter());
    const back = el("button", "hud-gothic-btn", buttons);
    back.type = "button";
    back.innerHTML = `<span class="hud-keycap hud-keycap-small">Esc</span> Recuar`;
    back.addEventListener("click", onBack);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean) {
    if (open && this.root.hidden) restartAnimation(this.root, "hud-plate-in");
    this.root.hidden = !open;
    this.backdrop.hidden = !open;
  }

  update(view: PortalView) {
    setText(this.hp, `${view.maxHp} / ${view.maxHp}`);
    // A run começa com a fome cheia (HUNGER_MAX); na cidade ela não cai.
    setText(this.hunger, "100%");
    const used = view.inventory.filter((slot) => slot && slot.count > 0).length;
    setText(this.bag, `${used} / ${INVENTORY_SLOTS}`);
    const food = view.inventory.reduce((sum, slot) => sum + (slot?.item === "racao" ? slot.count : 0), 0);
    setText(this.bagNote, food > 0 ? `${food} ${food === 1 ? "ração" : "rações"}` : "sem comida!");
    this.bagNote.classList.toggle("hud-portal-alert", food === 0);
  }
}

// Recomeça uma animação de CSS (a placa entra de novo).
function restartAnimation(node: HTMLElement, className: string) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}
