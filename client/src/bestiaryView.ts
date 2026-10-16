import { BESTIARY_KINDS, FIRST_KILL_XP, ITEMS, MOB_DROPS, MOB_KINDS, adventurerRank, type MobKind } from "shared";
import layout from "../../assets/ui/hud/layout.json";
import { ICONS, MOB_SPRITES, el, place, rarityStyle, setText, type Tooltip } from "./hudParts";

// Aba Bestiário do Salão da Guilda: o Rank de Aventureiro da linhagem no topo e um card por tipo de mob do jogo.
// Tipo que a linhagem já matou: sprite, nome, atributos, drops e o selo do XP de primeira morte deste personagem.
// Nunca morto pela linhagem: silhueta escura e "???". Só desenho: bestiário e mortes vêm do servidor (do banco).

const LEATHER = layout.leather;
const CARD_W = 111;
const CARD_H = 140;
const CARD_GAP = 5;
const CARDS_TOP = 34;
const SPRITE = 64;
const DROP_ICON = 16;
const MOB_TITLES: Record<MobKind, string> = { lobo: "Lobo", gnomo: "Gnomo", slime: "Slime", goblin: "Goblin" };

class MobCard {
  private readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly sprite: HTMLImageElement;
  private readonly details: HTMLDivElement[] = [];
  private readonly seal: HTMLDivElement;

  constructor(parent: HTMLElement, tooltip: Tooltip, private readonly kind: MobKind, x: number, y: number) {
    this.root = place(el("div", "hud-abs hud-card", parent), x, y, CARD_W, CARD_H);
    this.name = place(el("div", "hud-abs hud-card-name", this.root), 0, 3, CARD_W);
    this.sprite = place(el("img", "hud-abs", this.root), (CARD_W - SPRITE) / 2, 13, SPRITE, SPRITE);
    this.sprite.src = MOB_SPRITES.get(kind) ?? "";
    this.sprite.alt = "";
    this.sprite.draggable = false;
    const stats = MOB_KINDS[kind];
    const lines = [`Vida ${stats.maxHp} · Dano ${stats.attackDamage}`, `Velocidade ${stats.speed}`];
    lines.forEach((text, i) => {
      const line = place(el("div", "hud-abs hud-card-text", this.root), 0, 79 + i * 10, CARD_W);
      line.textContent = text;
      this.details.push(line);
    });
    this.details.push(this.drops(tooltip));
    this.seal = place(el("div", "hud-abs hud-card-seal", this.root), 0, 123, CARD_W);
  }

  // Drops conhecidos: um ícone por item que o mob pode largar; a dica diz a chance e a quantidade.
  private drops(tooltip: Tooltip): HTMLDivElement {
    const entries = MOB_DROPS[this.kind];
    const width = entries.length * (DROP_ICON + 2) - 2;
    const row = place(el("div", "hud-abs", this.root), (CARD_W - width) / 2, 101, width, DROP_ICON);
    entries.forEach((drop, i) => {
      const icon = place(el("img", "hud-abs hud-card-drop", row), i * (DROP_ICON + 2), 0, DROP_ICON, DROP_ICON);
      icon.src = ICONS.get(drop.item) ?? "";
      icon.alt = "";
      icon.draggable = false;
      const stats = ITEMS[drop.item];
      const rarity = rarityStyle(stats.rarity);
      const amount = drop.min === drop.max ? `${drop.min}` : `${drop.min} a ${drop.max}`;
      tooltip.attach(icon, () => ({
        title: stats.name,
        titleColor: rarity.color,
        subtitle: rarity.name,
        lines: [`Chance: ${Math.round(drop.chance * 100)}%`, `Quantidade: ${amount}`],
      }));
    });
    return row;
  }

  set(known: boolean, killed: boolean) {
    setText(this.name, known ? MOB_TITLES[this.kind] : "???");
    this.sprite.classList.toggle("hud-silhouette", !known);
    for (const detail of this.details) detail.hidden = !known;
    this.seal.classList.toggle("hud-seal-done", known && killed);
    this.seal.classList.toggle("hud-seal-open", known && !killed);
    if (!known) setText(this.seal, "Nunca abatido pela linhagem");
    else setText(this.seal, killed ? "✔ XP de 1ª morte obtido" : `★ 1ª morte: +${FIRST_KILL_XP} XP`);
  }
}

export class BestiaryView {
  private readonly rankTitle: HTMLDivElement;
  private readonly rankLine: HTMLDivElement;
  private readonly cards = new Map<MobKind, MobCard>();
  private shown = "";

  constructor(parent: HTMLElement, tooltip: Tooltip) {
    this.rankTitle = place(el("div", "hud-abs hud-rank-title", parent), LEATHER.x, LEATHER.y + 4, LEATHER.w);
    this.rankLine = place(el("div", "hud-abs hud-window-text", parent), LEATHER.x, LEATHER.y + 19, LEATHER.w);
    // 2 por linha. Com os 4 tipos do 1º andar cabe tudo; mais andares vão pedir rolagem ou páginas.
    BESTIARY_KINDS.forEach((kind, i) => {
      const x = LEATHER.x + (i % 2) * (CARD_W + CARD_GAP);
      const y = LEATHER.y + CARDS_TOP + Math.floor(i / 2) * (CARD_H + 4);
      this.cards.set(kind, new MobCard(parent, tooltip, kind, x, y));
    });
  }

  update(bestiary: readonly string[], kills: readonly string[]) {
    const key = `${bestiary.join(",")}|${kills.join(",")}`;
    if (key === this.shown) return;
    this.shown = key;
    const { known, current, next } = adventurerRank(bestiary);
    setText(this.rankTitle, `Rank ${current.rank} — ${current.title}`);
    const progress = `Bestiário ${known}/${BESTIARY_KINDS.length}`;
    setText(this.rankLine, next ? `${progress} · Rank ${next.rank} com ${next.bestiary} tipos` : `${progress} · rank máximo deste andar`);
    for (const [kind, card] of this.cards) card.set(bestiary.includes(kind), kills.includes(kind));
  }
}
