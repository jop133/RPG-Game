import {
  BUY_PRICES,
  CLASS_NAMES,
  FORGE_PRICES,
  FORGE_RECIPES,
  INVENTORY_SLOTS,
  ITEMS,
  SELL_PRICES,
  STASH_SLOTS,
  equipSlotOf,
  type ForgeItem,
  type ItemId,
  type ItemStats,
  type StationId,
} from "shared";
import layout from "../../assets/ui/hud/layout.json";
import { BestiaryView } from "./bestiaryView";
import {
  ART,
  EQUIP_NAMES,
  ICONS,
  MOB_SPRITES,
  SlotView,
  attackText,
  bonusText,
  coinAmount,
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

// Janelas dos móveis dos prédios da cidade (E no balcão, na bigorna, no baú, na mesa do bestiário). Uma janela só,
// com uma página por móvel, na linguagem da janela de inventário (ferro negro rebitado, bronze e couro; px de tela
// na tela-base, ampliados por --u):
// - em cima, o diálogo do NPC: brasão, nome e título em dourado, a fala; à direita, a placa de ouro e o fechar;
// - à esquerda, a vitrine (cartões de item com preço e botão), o baú da linhagem ou o bestiário;
// - à direita, a mochila (12 slots grandes): ver, comparar e, no balcão e no baú, vender ou guardar com 1 clique.
// Só desenho: cada clique manda um pedido ao servidor, que confere se o jogador está no móvel certo e decide (regra 1).

export interface CityView {
  coins: number;
  inventory: readonly (HudSlot | undefined)[];
  // Só chegam na cidade: baú da linhagem, tipos que a linhagem já matou e os que este personagem já matou.
  stash?: readonly (HudSlot | undefined)[];
  bestiary?: readonly string[];
  kills?: readonly string[];
}

export type Send = (type: string, message: unknown) => void;

// O painel largo da arte (490x640) a 7/8, para o diálogo caber em cima numa tela de 768 de altura; o couro dele
// (a área de dentro) na mesma escala.
const WIDE = layout.inv_panel_wide;
const WIDE_LEATHER = layout.leather_wide;
const K = 0.875;
const PANEL = { w: Math.round(WIDE.w * K), h: Math.round(WIDE.h * K) };
const LEATHER = {
  x: Math.round(WIDE_LEATHER.x * K),
  y: Math.round(WIDE_LEATHER.y * K),
  w: Math.round(WIDE_LEATHER.w * K),
  h: Math.round(WIDE_LEATHER.h * K),
};
const BANNER_H = 100;
const PANEL_GAP = 12;
const BODY_Y = BANNER_H + 10;
const WINDOW = { w: 2 * PANEL.w + PANEL_GAP, h: BODY_Y + PANEL.h };
const BAG_SLOT = 64;
const BAG_GAP = 8;
const BAG_COLUMNS = 4;
const STASH_SLOT = 46;
const STASH_GAP = 5;
const STASH_COLUMNS = 6;
const CREST = 64;

// O NPC de cada móvel: nome, título, fala e o brasão (um ícone da arte).
interface Npc {
  name: string;
  title: string;
  quote: string;
  crest: () => string;
}

const NPCS: Record<StationId, Npc> = {
  "guild-counter": {
    name: "Intendente da Guilda",
    title: "Balcão de Recepção",
    quote: "Tudo o que sai vivo daquele buraco tem preço. Mostre o que trouxe e eu digo quanto vale.",
    crest: () => ART.get("icon_coin") ?? "",
  },
  "guild-bestiary": {
    name: "Arquivista da Guilda",
    title: "Bestiário da Linhagem",
    quote: "Cada fera que sua linhagem abateu está anotada aqui. Conheça o inimigo antes de descer.",
    crest: () => MOB_SPRITES.get("lobo") ?? "",
  },
  "inn-counter": {
    name: "Mestre Cuca da Estalagem",
    title: "Balcão de Comida",
    quote: "Estômago vazio não volta do labirinto. Leve rações — mas deixe espaço na mochila para o saque.",
    crest: () => ICONS.get("racao") ?? "",
  },
  "inn-chest": {
    name: "Guardião da Linhagem",
    title: "Baú da Linhagem",
    quote: "O que for guardado aqui sobrevive a você. Seus herdeiros encontrarão tudo no mesmo lugar.",
    crest: () => ART.get("icon_lock") ?? "",
  },
  "blacksmith-counter": {
    name: "Mestre Ferreiro",
    title: "Balcão do Ferreiro",
    quote: "O aço frio é a única coisa entre você e as criaturas lá embaixo...",
    crest: () => ICONS.get("espada_ferro") ?? "",
  },
  "blacksmith-anvil": {
    name: "Mestre Ferreiro",
    title: "Bigorna — Forja",
    quote: "Traga couro, presas e cristal da caverna, e eu transformo em armadura. A forja ainda está esquentando.",
    crest: () => ICONS.get("peitoral_ferro") ?? "",
  },
};

// O que a mochila diz sob os slots, por móvel.
const BAG_HELP: Record<StationId, string> = {
  "guild-counter": "Clique num item da mochila para vender 1.",
  "guild-bestiary": "Sua mochila, para conferir o loot.",
  "inn-counter": "A comida comprada vem para a mochila.",
  "inn-chest": "Clique num item da mochila para guardá-lo no baú.",
  "blacksmith-counter": "As peças compradas vêm para a mochila.",
  "blacksmith-anvil": "Os materiais da forja saem da mochila.",
};

// ---------------------------------------------------------------- cartão de item

interface CardButton {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}

// item: um item do jogo (ícone, nome e raridade dele). Sem item (receita da forja): `name` e `art` (a silhueta do slot).
interface CardSpec {
  item?: ItemId;
  name?: string;
  art?: string;
  count?: number;
  tags: string[];
  // Bônus ou efeito (verde claro); materiais da receita.
  effect: string;
  price?: number;
  priceNote?: string;
  // O que falta (moedas, materiais), em vermelho suave.
  missing?: string;
  buttons: CardButton[];
}

// Cartão de couro e ferro: o ícone na moldura da raridade, o nome, as etiquetas, o efeito, o preço e os botões.
class WareCard {
  readonly root: HTMLDivElement;
  private readonly frame: HTMLImageElement;
  private readonly icon: HTMLImageElement;
  private readonly count: HTMLSpanElement;
  private readonly name: HTMLDivElement;
  private readonly tags: HTMLDivElement;
  private readonly effect: HTMLDivElement;
  private readonly price: HTMLSpanElement;
  private readonly priceBox: HTMLDivElement;
  private readonly priceNote: HTMLSpanElement;
  private readonly missing: HTMLDivElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private handlers: ((() => void) | undefined)[] = [];
  private shown = "";
  private item?: ItemId;

  constructor(parent: HTMLElement, tooltip: Tooltip) {
    this.root = el("div", "hud-ware", parent);
    const art = el("div", "hud-ware-art", this.root);
    this.frame = el("img", "hud-ware-frame", art);
    this.icon = el("img", "hud-ware-icon", art);
    this.count = el("span", "hud-ware-count", art);
    for (const img of [this.frame, this.icon]) {
      img.alt = "";
      img.draggable = false;
    }
    const text = el("div", "hud-ware-text", this.root);
    this.name = el("div", "hud-ware-name", text);
    this.tags = el("div", "hud-ware-tags", text);
    this.effect = el("div", "hud-ware-effect", text);
    // O que falta (moedas ou materiais) fica junto do texto, não da coluna do preço: ela fica estreita e o nome cabe.
    this.missing = el("div", "hud-ware-missing", text);
    const side = el("div", "hud-ware-side", this.root);
    this.priceBox = el("div", "hud-ware-price", side);
    this.price = coinAmount(this.priceBox);
    this.priceNote = el("span", "hud-ware-price-note", this.priceBox);
    const row = el("div", "hud-ware-buttons", side);
    for (let i = 0; i < 2; i++) {
      const button = el("button", "hud-gothic-btn hud-gothic-small", row);
      button.type = "button";
      button.addEventListener("click", () => this.handlers[i]?.());
      this.buttons.push(button);
    }
    tooltip.attach(art, () => (this.item ? itemTooltip(this.item, 1) : undefined));
  }

  set(spec: CardSpec | undefined) {
    this.root.hidden = !spec;
    if (!spec) return;
    this.item = spec.item;
    this.handlers = spec.buttons.map((b) => b.onClick);
    const id = JSON.stringify({ ...spec, buttons: spec.buttons.map((b) => [b.label, b.disabled]) });
    if (id === this.shown) return;
    this.shown = id;
    const stats = spec.item ? (ITEMS[spec.item] as ItemStats) : undefined;
    const rarity = rarityStyle(stats?.rarity ?? "common");
    this.frame.src = ART.get(frameName(stats?.rarity ?? "common", 48)) ?? "";
    this.icon.src = spec.item ? (ICONS.get(spec.item) ?? "") : (spec.art ?? "");
    this.icon.classList.toggle("hud-ware-silhouette", !spec.item);
    setText(this.count, spec.count && spec.count > 1 ? `x${spec.count}` : "");
    setText(this.name, stats?.name ?? spec.name ?? "");
    this.name.style.color = rarity.color;
    this.tags.replaceChildren(
      ...[...(stats ? [rarity.name] : []), ...spec.tags].map((tag, i) => {
        const chip = document.createElement("span");
        chip.className = stats && i === 0 ? "hud-ware-tag hud-ware-rarity" : tag.startsWith("Exclusivo") ? "hud-ware-tag hud-ware-exclusive" : "hud-ware-tag";
        chip.textContent = tag;
        return chip;
      }),
    );
    setText(this.effect, spec.effect);
    this.priceBox.hidden = spec.price === undefined;
    setText(this.price, String(spec.price ?? 0));
    setText(this.priceNote, spec.priceNote ?? "");
    setText(this.missing, spec.missing ?? "");
    this.missing.hidden = !spec.missing;
    this.buttons.forEach((button, i) => {
      const b = spec.buttons[i];
      button.hidden = !b;
      if (!b) return;
      setText(button, b.label);
      button.disabled = Boolean(b.disabled);
    });
  }
}

// Etiquetas e efeito de um item: o slot de equipamento, a classe exclusiva, e o bônus / golpe / fome / essência.
function describe(item: ItemId): { tags: string[]; effect: string } {
  const stats = ITEMS[item] as ItemStats;
  const tags: string[] = [];
  const slot = equipSlotOf(item);
  if (slot) tags.push(EQUIP_NAMES[slot]);
  const allowed = stats.equip?.allowedClasses;
  if (allowed) tags.push(`Exclusivo: ${allowed.map((id) => CLASS_NAMES[id]).join(", ")}`);
  const effects: string[] = [];
  if (stats.equip?.weapon) effects.push(attackText(stats.equip.weapon));
  if (stats.equip?.bonus) effects.push(bonusText(stats.equip.bonus).replaceAll(", ", " · "));
  if (stats.food) effects.push(`Restaura ${stats.food} de fome`);
  if (stats.essence) effects.push(`Essência: ${essenceEffectText(stats.essence)}`);
  if (effects.length === 0) effects.push("Material da caverna");
  return { tags, effect: effects.join(" · ") };
}

// O que a mochila tem para vender: um item por linha (pilhas somadas), na ordem em que aparece.
function sellable(inventory: readonly (HudSlot | undefined)[]): { item: ItemId; count: number }[] {
  const totals = new Map<ItemId, number>();
  for (const slot of inventory) {
    if (!slot || slot.count <= 0 || SELL_PRICES[slot.item as ItemId] === undefined) continue;
    totals.set(slot.item as ItemId, (totals.get(slot.item as ItemId) ?? 0) + slot.count);
  }
  return [...totals].map(([item, count]) => ({ item, count }));
}

function countIn(inventory: readonly (HudSlot | undefined)[], item: ItemId): number {
  return inventory.reduce((sum, slot) => sum + (slot?.item === item ? slot.count : 0), 0);
}

const MAX_SELL_CARDS = Object.keys(SELL_PRICES).length;
const TAVERN_GOODS = Object.keys(BUY_PRICES) as ItemId[];
const FORGE_GOODS = Object.keys(FORGE_PRICES) as ItemId[];

// ---------------------------------------------------------------- a janela

export class StationWindow {
  readonly root: HTMLDivElement;
  private readonly backdrop: HTMLDivElement;
  private readonly crest: HTMLImageElement;
  private readonly npcName: HTMLDivElement;
  private readonly npcTitle: HTMLDivElement;
  private readonly quote: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private readonly leftTitle: HTMLDivElement;
  private readonly pages = new Map<StationId, HTMLDivElement>();
  private readonly bagSlots: SlotView[] = [];
  private readonly bagTitle: HTMLDivElement;
  private readonly bagHelp: HTMLDivElement;
  private readonly sellCards: WareCard[] = [];
  private readonly sellEmpty: HTMLDivElement;
  private readonly tavernCards: WareCard[] = [];
  private readonly forgeCards: WareCard[] = [];
  private readonly recipeCards: WareCard[] = [];
  private readonly stashSlots: SlotView[] = [];
  private readonly bestiary: BestiaryView;
  private station?: StationId;
  private view?: CityView;

  constructor(parent: HTMLElement, tooltip: Tooltip, private readonly send: Send, onClose: () => void) {
    this.backdrop = el("div", "hud-shop-backdrop", parent);
    this.backdrop.hidden = true;
    this.backdrop.addEventListener("click", onClose);
    this.root = size(el("div", "hud-window hud-shop", parent), WINDOW.w, WINDOW.h);
    this.root.hidden = true;

    // Diálogo do NPC, em cima.
    const banner = place(el("div", "hud-abs hud-shop-banner", this.root), 0, 0, WINDOW.w, BANNER_H);
    for (const corner of ["tl", "tr", "bl", "br"]) el("span", `hud-plate-corner hud-plate-corner-${corner}`, banner);
    const crestBox = place(el("div", "hud-abs hud-shop-crest", banner), 18, (BANNER_H - CREST) / 2, CREST, CREST);
    place(image("slot_legendary", "hud-abs", crestBox), 0, 0, CREST, CREST);
    this.crest = place(el("img", "hud-abs hud-shop-crest-icon", crestBox), 8, 8, CREST - 16, CREST - 16);
    this.crest.alt = "";
    const talk = place(el("div", "hud-abs hud-shop-talk", banner), 18 + CREST + 16, 12, WINDOW.w - CREST - 300, BANNER_H - 24);
    this.npcName = el("div", "hud-shop-npc", talk);
    this.npcTitle = el("div", "hud-shop-npc-title", talk);
    this.quote = el("div", "hud-shop-quote", talk);
    const gold = place(el("div", "hud-abs hud-shop-gold", banner), WINDOW.w - 220, 22, 132, 56);
    el("div", "hud-shop-gold-label", gold).textContent = "Moedas da linhagem";
    const amount = el("div", "hud-shop-gold-amount", gold);
    image("icon_coin", "hud-shop-gold-coin", amount);
    this.coins = el("span", "", amount);
    const close = place(el("button", "hud-abs hud-shop-close", banner), WINDOW.w - 76, 26, 58, 48);
    close.type = "button";
    close.innerHTML = `<span class="hud-shop-close-x">✕</span><span class="hud-shop-close-key">Esc</span>`;
    close.addEventListener("click", onClose);

    // Ala esquerda: a página do móvel.
    const left = place(el("div", "hud-abs", this.root), 0, BODY_Y, PANEL.w, PANEL.h);
    place(image("inv_panel_wide", "hud-abs", left), 0, 0, PANEL.w, PANEL.h);
    this.leftTitle = place(el("div", "hud-abs hud-inv-title hud-shop-title", left), 0, LEATHER.y - 30, PANEL.w);
    const pageArea = () => place(el("div", "hud-abs hud-shop-page", left), LEATHER.x + 6, LEATHER.y + 6, LEATHER.w - 12, LEATHER.h - 12);

    const merchant = pageArea();
    this.pages.set("guild-counter", merchant);
    const sellList = el("div", "hud-shop-list", merchant);
    for (let i = 0; i < MAX_SELL_CARDS; i++) this.sellCards.push(new WareCard(sellList, tooltip));
    this.sellEmpty = el("div", "hud-shop-empty", sellList);
    this.sellEmpty.textContent = "Nada que a Guilda compre na mochila. Traga loot do labirinto.";

    const tavern = pageArea();
    this.pages.set("inn-counter", tavern);
    const tavernList = el("div", "hud-shop-list", tavern);
    for (let i = 0; i < TAVERN_GOODS.length; i++) this.tavernCards.push(new WareCard(tavernList, tooltip));
    el("div", "hud-shop-empty", tavernList).textContent = "Comida ocupa espaço na mochila: leve o bastante para a fome e deixe lugar para o loot.";

    const catalog = pageArea();
    this.pages.set("blacksmith-counter", catalog);
    const forgeList = el("div", "hud-shop-list", catalog);
    for (let i = 0; i < FORGE_GOODS.length; i++) this.forgeCards.push(new WareCard(forgeList, tooltip));

    const anvil = pageArea();
    this.pages.set("blacksmith-anvil", anvil);
    const recipeList = el("div", "hud-shop-list", anvil);
    for (let i = 0; i < FORGE_RECIPES.length; i++) this.recipeCards.push(new WareCard(recipeList, tooltip));
    el("div", "hud-shop-empty", recipeList).textContent = "A forja abre junto com a maestria de armas.";

    const chest = pageArea();
    this.pages.set("inn-chest", chest);
    const gridW = STASH_COLUMNS * STASH_SLOT + (STASH_COLUMNS - 1) * STASH_GAP;
    for (let i = 0; i < STASH_SLOTS; i++) {
      const slot = new SlotView(chest, i, (index) => send("withdraw", { slot: index }), tooltip, {
        frameSize: 48,
        iconScale: 2,
        emptyFrame: true,
        display: STASH_SLOT,
        clickHint: () => "Clique para levar à mochila",
      });
      const x = (LEATHER.w - 12 - gridW) / 2 + (i % STASH_COLUMNS) * (STASH_SLOT + STASH_GAP);
      place(slot.root, Math.round(x), 8 + Math.floor(i / STASH_COLUMNS) * (STASH_SLOT + STASH_GAP));
      this.stashSlots.push(slot);
    }
    place(el("div", "hud-abs hud-shop-empty", chest), 0, 8 + 4 * (STASH_SLOT + STASH_GAP) + 8, LEATHER.w - 12).textContent =
      "Clique num item do baú para trazê-lo à mochila. O baú é da linhagem: o herdeiro encontra tudo aqui.";

    // Bestiário: a mesma vista de antes, desenhada para o couro do painel antigo; ampliada para caber neste couro.
    const bestiaryPage = place(el("div", "hud-abs", left), 0, 0, PANEL.w, PANEL.h);
    this.pages.set("guild-bestiary", bestiaryPage);
    const old = layout.leather;
    const k = Math.min(LEATHER.w / old.w, LEATHER.h / old.h);
    const legacy = el("div", "hud-abs hud-shop-legacy", bestiaryPage);
    legacy.style.transform = `translate(${LEATHER.x + (LEATHER.w - old.w * k) / 2 - old.x * k}px, ${LEATHER.y + (LEATHER.h - old.h * k) / 2 - old.y * k}px) scale(${k})`;
    this.bestiary = new BestiaryView(legacy, tooltip);

    // Ala direita: a mochila.
    const right = place(el("div", "hud-abs", this.root), PANEL.w + PANEL_GAP, BODY_Y, PANEL.w, PANEL.h);
    place(image("inv_panel_wide", "hud-abs", right), 0, 0, PANEL.w, PANEL.h);
    this.bagTitle = place(el("div", "hud-abs hud-inv-title hud-shop-title", right), 0, LEATHER.y - 30, PANEL.w);
    const bagW = BAG_COLUMNS * BAG_SLOT + (BAG_COLUMNS - 1) * BAG_GAP;
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = new SlotView(right, i, (index) => this.onBagClick(index), tooltip, {
        frameSize: 48,
        iconScale: 3,
        emptyFrame: true,
        display: BAG_SLOT,
        clickHint: () => this.bagClickHint(i),
      });
      const x = LEATHER.x + (LEATHER.w - bagW) / 2 + (i % BAG_COLUMNS) * (BAG_SLOT + BAG_GAP);
      place(slot.root, Math.round(x), LEATHER.y + 18 + Math.floor(i / BAG_COLUMNS) * (BAG_SLOT + BAG_GAP));
      this.bagSlots.push(slot);
    }
    this.bagHelp = place(el("div", "hud-abs hud-shop-empty", right), LEATHER.x + 8, LEATHER.y + 18 + 3 * (BAG_SLOT + BAG_GAP) + 10, LEATHER.w - 16);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  get current(): StationId | undefined {
    return this.station;
  }

  show(station: StationId) {
    this.station = station;
    const npc = NPCS[station];
    this.crest.src = npc.crest();
    setText(this.npcName, npc.name);
    setText(this.npcTitle, npc.title);
    setText(this.quote, `“${npc.quote}”`);
    setText(this.leftTitle, npc.title);
    setText(this.bagHelp, BAG_HELP[station]);
    for (const [id, page] of this.pages) page.hidden = id !== station;
    this.root.hidden = false;
    this.backdrop.hidden = false;
    if (this.view) this.update(this.view);
  }

  hide() {
    this.station = undefined;
    this.root.hidden = true;
    this.backdrop.hidden = true;
  }

  update(view: CityView) {
    this.view = view;
    setText(this.coins, String(view.coins));
    const used = view.inventory.filter((slot) => slot && slot.count > 0).length;
    setText(this.bagTitle, `Mochila (${used} / ${INVENTORY_SLOTS})`);
    this.bagSlots.forEach((slot, i) => {
      const content = view.inventory[i];
      slot.set(content && content.count > 0 ? content : undefined);
    });
    switch (this.station) {
      case "guild-counter":
        return this.updateMerchant(view);
      case "guild-bestiary":
        return this.bestiary.update(view.bestiary ?? [], view.kills ?? []);
      case "inn-counter":
        return this.updateTavern(view);
      case "inn-chest":
        return this.stashSlots.forEach((slot, i) => {
          const content = view.stash?.[i];
          slot.set(content && content.count > 0 ? content : undefined);
        });
      case "blacksmith-counter":
        return this.updateForge(view);
      case "blacksmith-anvil":
        return this.updateRecipes(view);
    }
  }

  // Balcão da Guilda: um cartão por item vendável da mochila (pilhas somadas).
  private updateMerchant(view: CityView) {
    const goods = sellable(view.inventory);
    this.sellCards.forEach((card, i) => {
      const good = goods[i];
      if (!good) return card.set(undefined);
      const price = SELL_PRICES[good.item] ?? 0;
      card.set({
        item: good.item,
        count: good.count,
        ...describe(good.item),
        price,
        priceNote: "cada",
        buttons: [
          { label: "Vender 1", onClick: () => this.send("sell", { item: good.item, count: 1 }) },
          { label: `Tudo (+${price * good.count})`, onClick: () => this.send("sell", { item: good.item, count: good.count }) },
        ],
      });
    });
    this.sellEmpty.hidden = goods.length > 0;
  }

  // Estalagem: comida por unidade e a pilha cheia. Sem moedas, o botão apagado e o que falta (quem recusa é o servidor).
  private updateTavern(view: CityView) {
    TAVERN_GOODS.forEach((item, i) => {
      const price = BUY_PRICES[item] ?? 0;
      const stack = ITEMS[item].maxStack;
      const short = price - view.coins;
      this.tavernCards[i]?.set({
        item,
        ...describe(item),
        price,
        priceNote: "cada",
        missing: short > 0 ? `Faltam ${short} moedas` : undefined,
        buttons: [
          { label: "Comprar 1", disabled: view.coins < price, onClick: () => this.send("buy", { item, count: 1 }) },
          { label: `Comprar ${stack}`, disabled: view.coins < price * stack, onClick: () => this.send("buy", { item, count: stack }) },
        ],
      });
    });
  }

  // Balcão do Ferreiro: o catálogo da Forja.
  private updateForge(view: CityView) {
    FORGE_GOODS.forEach((item, i) => {
      const price = FORGE_PRICES[item] ?? 0;
      const short = price - view.coins;
      this.forgeCards[i]?.set({
        item,
        ...describe(item),
        price,
        priceNote: price === 0 ? "de graça" : "",
        missing: short > 0 ? `Faltam ${short} moedas` : undefined,
        buttons: [{ label: "Comprar", disabled: short > 0, onClick: () => this.send("forgeBuy", { item, count: 1 }) }],
      });
    });
  }

  // Bigorna: as receitas (vitrine por enquanto): materiais que faltam em vermelho, o botão Forjar apagado.
  private updateRecipes(view: CityView) {
    FORGE_RECIPES.forEach((recipe: ForgeItem, i) => {
      const materials = Object.entries(recipe.materials ?? {}) as [ItemId, number][];
      const lacking = materials
        .map(([material, need]) => [material, need - countIn(view.inventory, material)] as const)
        .filter(([, short]) => short > 0)
        .map(([material, short]) => `${short} ${ITEMS[material].name}`);
      const coinsShort = recipe.coins - view.coins;
      const missing = [...lacking, ...(coinsShort > 0 ? [`${coinsShort} moedas`] : [])];
      const card = this.recipeCards[i];
      if (!card) return;
      card.set({
        name: recipe.name,
        art: ART.get(`equip_${recipe.slot}`) ?? "",
        tags: [EQUIP_NAMES[recipe.slot], "Em breve"],
        effect: `Materiais: ${materials.map(([material, need]) => `${need} ${ITEMS[material].name}`).join(" · ") || "nenhum"}`,
        price: recipe.coins,
        priceNote: "de trabalho",
        missing: missing.length > 0 ? `Faltam ${missing.join(", ")}` : undefined,
        buttons: [{ label: "Forjar", disabled: true }],
      });
    });
  }

  // Clique num slot da mochila: no balcão da Guilda vende 1; no baú, guarda a pilha; nos outros, nada.
  private onBagClick(index: number) {
    const slot = this.view?.inventory[index];
    if (!slot || slot.count <= 0) return;
    if (this.station === "guild-counter" && SELL_PRICES[slot.item as ItemId] !== undefined) this.send("sell", { item: slot.item, count: 1 });
    if (this.station === "inn-chest") this.send("deposit", { slot: index });
  }

  private bagClickHint(index: number): string | undefined {
    const slot = this.view?.inventory[index];
    if (!slot || slot.count <= 0) return undefined;
    if (this.station === "inn-chest") return "Clique para guardar no baú";
    if (this.station !== "guild-counter") return undefined;
    const price = SELL_PRICES[slot.item as ItemId];
    return price === undefined ? "A Guilda não compra isto" : `Clique para vender 1 (+${price})`;
  }
}
