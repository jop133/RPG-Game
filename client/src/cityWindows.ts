import {
  BUY_PRICES,
  FORGE_CATALOG,
  FORGE_RECIPES,
  INVENTORY_SLOTS,
  ITEMS,
  SELL_PRICES,
  STASH_SLOTS,
  type ForgeItem,
  type ItemId,
} from "shared";
import layout from "../../assets/ui/hud/layout.json";
import { BestiaryView } from "./bestiaryView";
import {
  EQUIP_NAMES,
  ICONS,
  ItemBadge,
  SlotView,
  button,
  coinAmount,
  el,
  image,
  itemTooltip,
  place,
  rarityStyle,
  setText,
  size,
  type HudSlot,
  type Tooltip,
} from "./hudParts";

// Janelas dos prédios da cidade (E na porta): Salão da Guilda, Estalagem e Forja. Só desenho: cada clique manda um
// pedido ao servidor, que confere se o jogador está na porta certa e decide (regra 1). Mochila, baú, moedas e
// bestiário chegam do estado a cada quadro (update). Mesma arte e medidas da janela de inventário (pixels de HUD, a
// partir do couro).

export interface CityView {
  coins: number;
  inventory: readonly (HudSlot | undefined)[];
  // Só chegam na cidade: baú da linhagem, tipos que a linhagem já matou e os que este personagem já matou.
  stash?: readonly (HudSlot | undefined)[];
  bestiary?: readonly string[];
  kills?: readonly string[];
}

export interface CityWindow {
  readonly root: HTMLDivElement;
  update(view: CityView): void;
}

export type Send = (type: string, message: unknown) => void;

const PANEL = layout.inv_panel;
const LEATHER = layout.leather;
// Os dois painéis da Estalagem encostados: um vão mostraria o mundo entre eles.
const PANEL_GAP = 0;
// Meia largura da faixa atrás da emenda dos dois painéis.
const SEAM = 22;
const BIG = 48;
const GRID_GAP = 4;
const GRID_COLUMNS = 4;
const ROW = 33;
const FORGE_ROW = 46;
const EQUIP_ART = 40;
// Uma linha por item vendável: cabe a mochila inteira de itens diferentes.
const MAX_SELL_ROWS = Object.keys(SELL_PRICES).length;
const KEYS_HINT = "[E] ou [Esc] fecha";

// Painel de ferro e couro na posição x do bloco da janela.
function panel(parent: HTMLElement, x: number): HTMLDivElement {
  const root = place(el("div", "hud-abs", parent), x, 0, PANEL.w, PANEL.h);
  image("inv_panel", "hud-abs", root);
  return root;
}

// Janela de um painel só (Guilda, Forja), escondida até a porta ser aberta.
function singlePanelWindow(parent: HTMLElement): { root: HTMLDivElement; body: HTMLDivElement } {
  const root = size(el("div", "hud-window", parent), PANEL.w, PANEL.h);
  root.hidden = true;
  return { root, body: panel(root, 0) };
}

function title(parent: HTMLElement, text: string) {
  place(el("div", "hud-abs hud-window-title", parent), 0, LEATHER.y - 26, PANEL.w).textContent = text;
}

function caption(parent: HTMLElement, text: string, y: number, className = "hud-window-footer"): HTMLDivElement {
  const node = place(el("div", `hud-abs ${className}`, parent), LEATHER.x, y, LEATHER.w);
  node.textContent = text;
  return node;
}

// Moedas da linhagem dentro do couro, embaixo (embaixo do painel, a barra rápida pode cobrir: ver hud.css).
function purse(parent: HTMLElement, y = LEATHER.y + LEATHER.h - 16): HTMLSpanElement {
  const box = place(el("div", "hud-abs hud-window-purse hud-purse-center", parent), LEATHER.x, y, LEATHER.w);
  el("span", "", box).textContent = "Moedas da linhagem";
  return coinAmount(box);
}

// Grade de slots grandes (4 colunas), centrada no couro.
function grid(parent: HTMLElement, count: number, top: number, make: (i: number) => SlotView): SlotView[] {
  const width = GRID_COLUMNS * BIG + (GRID_COLUMNS - 1) * GRID_GAP;
  return Array.from({ length: count }, (_, i) => {
    const slot = make(i);
    const x = LEATHER.x + (LEATHER.w - width) / 2 + (i % GRID_COLUMNS) * (BIG + GRID_GAP);
    place(slot.root, Math.round(x), top + Math.floor(i / GRID_COLUMNS) * (BIG + GRID_GAP));
    return slot;
  });
}

function showSlots(slots: SlotView[], view: readonly (HudSlot | undefined)[] | undefined) {
  slots.forEach((slot, i) => {
    const content = view?.[i];
    slot.set(content && content.count > 0 ? content : undefined);
  });
}

// Abas no lugar do título de um painel. Cada aba tem a sua camada, do tamanho do painel; só a da aba ativa aparece.
// A barra vem depois das camadas e fica na frente (hud.css): senão as camadas pegariam o clique nas abas.
// Embaixo da barra, a linha das teclas, como na janela de inventário.
class Tabs<T extends string> {
  private readonly buttons = new Map<T, HTMLButtonElement>();
  private readonly layers = new Map<T, HTMLDivElement>();
  current: T;

  constructor(body: HTMLElement, tabs: readonly (readonly [T, string])[], private readonly onSelect?: (tab: T) => void) {
    for (const [id] of tabs) this.layers.set(id, place(el("div", "hud-abs", body), 0, 0, PANEL.w, PANEL.h));
    const bar = place(el("div", "hud-abs hud-tabs", body), 0, LEATHER.y - 33, PANEL.w);
    for (const [id, label] of tabs) {
      const tab = el("button", "hud-tab", bar);
      tab.type = "button";
      tab.textContent = label;
      tab.addEventListener("click", () => this.select(id));
      this.buttons.set(id, tab);
    }
    this.current = tabs[0]?.[0] as T;
  }

  layer(tab: T): HTMLDivElement {
    return this.layers.get(tab) as HTMLDivElement;
  }

  select(tab: T) {
    this.current = tab;
    for (const [id, node] of this.buttons) node.classList.toggle("hud-tab-active", id === tab);
    for (const [id, layer] of this.layers) layer.hidden = id !== tab;
    this.onSelect?.(tab);
  }
}

// Linha de loja: ícone, nome na cor da raridade, detalhe com o preço ("x5 · [moeda] 4 cada"), e dois botões.
class TradeRow {
  readonly root: HTMLDivElement;
  private readonly badge: ItemBadge;
  private readonly name: HTMLDivElement;
  private readonly detail: HTMLSpanElement;
  private readonly price: HTMLSpanElement;
  private readonly suffix: HTMLSpanElement;
  readonly one: HTMLButtonElement;
  readonly many: HTMLButtonElement;

  constructor(parent: HTMLElement, tooltip: Tooltip, y: number, oneLabel: string, onOne: () => void, onMany: () => void) {
    this.root = place(el("div", "hud-abs hud-trade-row", parent), LEATHER.x, y, LEATHER.w, ROW - 2);
    this.badge = new ItemBadge(this.root, tooltip, 28);
    place(this.badge.root, 2, 1);
    this.name = place(el("div", "hud-abs hud-trade-name", this.root), 34, 3, 102);
    const line = place(el("div", "hud-abs hud-trade-detail", this.root), 34, 16, 102);
    this.detail = el("span", "", line);
    this.price = coinAmount(line);
    this.suffix = el("span", "", line);
    this.one = place(button(this.root, oneLabel, onOne), 137, 7, 45, 17);
    this.many = place(button(this.root, "", onMany), 184, 7, 43, 17);
  }

  set(item: ItemId, count: number, detail: string, price: number) {
    const stats = ITEMS[item];
    this.badge.set(item, count);
    setText(this.name, stats.name);
    this.name.style.color = rarityStyle(stats.rarity).color;
    setText(this.detail, `${detail} ·`);
    setText(this.price, String(price));
    setText(this.suffix, "cada");
  }
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

// ---------------------------------------------------------------- Salão da Guilda

type GuildTab = "merchant" | "bestiary";
const GUILD_TABS = [
  ["merchant", "Mercador"],
  ["bestiary", "Bestiário"],
] as const;

// Mercador (vende o loot extraído por moedas, SELL_PRICES por unidade) e Bestiário com o Rank de Aventureiro.
export class GuildWindow implements CityWindow {
  readonly root: HTMLDivElement;
  private readonly rows: TradeRow[] = [];
  // O que cada linha mostra agora: o clique vende disto.
  private goods: { item: ItemId; count: number }[] = [];
  private readonly empty: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private readonly tabs: Tabs<GuildTab>;
  private readonly bestiary: BestiaryView;

  constructor(parent: HTMLElement, tooltip: Tooltip, send: Send) {
    const { root, body } = singlePanelWindow(parent);
    this.root = root;
    this.tabs = new Tabs<GuildTab>(body, GUILD_TABS);
    caption(body, KEYS_HINT, LEATHER.y - 11);

    const merchant = this.tabs.layer("merchant");
    caption(merchant, "Vende o loot extraído. Preço por unidade:", LEATHER.y + 5, "hud-window-text");
    for (let i = 0; i < MAX_SELL_ROWS; i++) {
      const sell = (all: boolean) => {
        const good = this.goods[i];
        if (good) send("sell", { item: good.item, count: all ? good.count : 1 });
      };
      this.rows.push(new TradeRow(merchant, tooltip, LEATHER.y + 18 + i * ROW, "Vender 1", () => sell(false), () => sell(true)));
    }
    this.empty = caption(merchant, "Nada para vender na mochila.\nTraga loot do labirinto.", LEATHER.y + 120, "hud-window-text");
    this.coins = purse(merchant);

    this.bestiary = new BestiaryView(this.tabs.layer("bestiary"), tooltip);
    this.tabs.select("merchant");
  }

  update(view: CityView) {
    if (this.tabs.current === "bestiary") return this.bestiary.update(view.bestiary ?? [], view.kills ?? []);
    this.goods = sellable(view.inventory);
    this.rows.forEach((row, i) => {
      const good = this.goods[i];
      row.root.hidden = !good;
      if (!good) return;
      const price = SELL_PRICES[good.item] ?? 0;
      row.set(good.item, good.count, `x${good.count}`, price);
      setText(row.many, `Tudo +${price * good.count}`);
    });
    this.empty.hidden = this.goods.length > 0;
    setText(this.coins, String(view.coins));
  }
}

// ---------------------------------------------------------------- Estalagem & Baú da Linhagem

type InnTab = "stash" | "tavern";
const INN_TABS = [
  ["stash", "Baú da Linhagem"],
  ["tavern", "Taverna"],
] as const;
// O que a Taverna vende, na ordem de BUY_PRICES.
const TAVERN_GOODS = Object.keys(BUY_PRICES) as ItemId[];

// Dois painéis lado a lado: a mochila do personagem e, à direita, o baú da linhagem ou a Taverna (abas).
export class InnWindow implements CityWindow {
  readonly root: HTMLDivElement;
  private readonly tabs: Tabs<InnTab>;
  private readonly bag: SlotView[];
  private readonly stash: SlotView[];
  private readonly tavern: { row: TradeRow; item: ItemId }[] = [];
  private readonly help: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private shownCoins = -1;

  constructor(parent: HTMLElement, tooltip: Tooltip, send: Send) {
    this.root = size(el("div", "hud-window", parent), 2 * PANEL.w + PANEL_GAP, PANEL.h);
    this.root.hidden = true;
    // Entre os painéis, a arte é transparente nas laterais (~19 px, menos nos parafusos): uma faixa de ferro por trás
    // fecha a emenda.
    place(el("div", "hud-abs hud-window-seam", this.root), PANEL.w - SEAM, 40, 2 * SEAM, PANEL.h - 80);

    // Esquerda: mochila. No baú, clicar guarda a pilha; na Taverna, só mostra (a comida comprada chega aqui).
    const left = panel(this.root, 0);
    title(left, "Mochila");
    caption(left, KEYS_HINT, LEATHER.y - 11);
    const depositHint = () => (this.tabs.current === "stash" ? "Clique para guardar no baú" : undefined);
    this.bag = grid(left, INVENTORY_SLOTS, LEATHER.y + 10, (i) =>
      new SlotView(left, i, (slot) => this.tabs.current === "stash" && send("deposit", { slot }), tooltip, {
        frameSize: BIG,
        iconScale: 2,
        emptyFrame: true,
        clickHint: depositHint,
      }),
    );
    this.coins = purse(left, LEATHER.y + 182);
    this.help = caption(left, "", LEATHER.y + 204, "hud-window-text");

    // Direita: abas no lugar do título.
    const right = panel(this.root, PANEL.w + PANEL_GAP);
    this.tabs = new Tabs<InnTab>(right, INN_TABS, (tab) => this.showHelp(tab));
    const stashLayer = this.tabs.layer("stash");
    this.stash = grid(stashLayer, STASH_SLOTS, LEATHER.y + 10, (i) =>
      new SlotView(stashLayer, i, (slot) => send("withdraw", { slot }), tooltip, {
        frameSize: BIG,
        iconScale: 2,
        emptyFrame: true,
        clickHint: () => "Clique para levar à mochila",
      }),
    );

    const tavernLayer = this.tabs.layer("tavern");
    caption(tavernLayer, "Suprimentos para o labirinto:", LEATHER.y + 5, "hud-window-text");
    TAVERN_GOODS.forEach((item, i) => {
      const buy = (count: number) => send("buy", { item, count });
      const row = new TradeRow(tavernLayer, tooltip, LEATHER.y + 18 + i * ROW, "Comprar 1", () => buy(1), () => buy(ITEMS[item].maxStack));
      this.tavern.push({ row, item });
    });
    caption(
      tavernLayer,
      "Comida ocupa espaço na mochila:\nleve o bastante para a fome\ne deixe lugar para o loot.",
      LEATHER.y + 30 + TAVERN_GOODS.length * ROW,
      "hud-window-text",
    );
    this.tabs.select("stash");
  }

  update(view: CityView) {
    showSlots(this.bag, view.inventory);
    showSlots(this.stash, view.stash);
    setText(this.coins, String(view.coins));
    if (view.coins === this.shownCoins) return;
    // O botão apagado é só aviso: quem recusa a compra sem moedas é o servidor.
    this.shownCoins = view.coins;
    for (const { row, item } of this.tavern) {
      const price = BUY_PRICES[item] ?? 0;
      const stack = ITEMS[item].maxStack;
      const stats = ITEMS[item] as (typeof ITEMS)[ItemId];
      row.set(item, 1, "food" in stats ? `fome +${stats.food}` : stats.name, price);
      setText(row.many, `x${stack} -${price * stack}`);
      row.one.disabled = view.coins < price;
      row.many.disabled = view.coins < price * stack;
    }
  }

  private showHelp(tab: InnTab) {
    setText(
      this.help,
      tab === "stash"
        ? "Clique num item da mochila para guardá-lo.\nClique num item do baú para trazê-lo.\n\nO baú é da linhagem:\no herdeiro encontra tudo aqui."
        : "A comida comprada vem para a mochila.",
    );
  }
}

// ---------------------------------------------------------------- Forja do Ferreiro (vitrine)

type ForgeTab = "catalog" | "recipes";
const FORGE_TABS = [
  ["catalog", "Catálogo"],
  ["recipes", "Forja"],
] as const;
const SOON = "Em breve";

// Peça da vitrine: silhueta do slot de equipamento com cadeado, nome, slot, materiais (receitas) e preço.
function forgeRow(parent: HTMLElement, tooltip: Tooltip, item: ForgeItem, y: number) {
  const row = place(el("div", "hud-abs hud-trade-row", parent), LEATHER.x, y, LEATHER.w, FORGE_ROW - 2);
  place(image(`equip_${item.slot}`, "hud-abs hud-equip-locked", row), 2, 2, EQUIP_ART, EQUIP_ART);
  place(image("icon_lock", "hud-abs", row), 2 + EQUIP_ART - 14, EQUIP_ART - 12, 16, 16);
  place(el("div", "hud-abs hud-trade-name hud-forge-name", row), 46, 3, 118).textContent = item.name;
  place(el("div", "hud-abs hud-trade-detail", row), 46, 15, 118).textContent = EQUIP_NAMES[item.slot];
  const materials = Object.entries(item.materials ?? {}) as [ItemId, number][];
  const line = place(el("div", "hud-abs hud-trade-detail", row), 46, 27, 118);
  for (const [material, count] of materials) {
    const icon = el("img", "hud-forge-material", line);
    icon.src = ICONS.get(material) ?? "";
    icon.alt = "";
    icon.draggable = false;
    tooltip.attach(icon, () => itemTooltip(material, count));
    el("span", "", line).textContent = `x${count}`;
  }
  const price = place(el("div", "hud-abs hud-trade-detail", row), 168, 7, 58);
  setText(coinAmount(price), String(item.coins));
  place(el("div", "hud-abs hud-forge-soon", row), 168, 24, 58).textContent = SOON;
  const recipe = materials.map(([material, count]) => `${count} ${ITEMS[material].name}`).join(", ");
  tooltip.attach(row, () => ({
    title: item.name,
    subtitle: EQUIP_NAMES[item.slot],
    lines: [
      ...(recipe ? [`Materiais: ${recipe}`] : []),
      `${recipe ? "Trabalho do ferreiro" : "Preço"}: ${item.coins} moedas`,
      "Em breve: o ferreiro ainda está acendendo a forja.",
    ],
  }));
}

// Vitrine até o passo 8 (armas e maestria): mostra o que vem, nada se compra nem se forja.
export class ForgeWindow implements CityWindow {
  readonly root: HTMLDivElement;
  private readonly coins: HTMLSpanElement[] = [];

  constructor(parent: HTMLElement, tooltip: Tooltip) {
    const { root, body } = singlePanelWindow(parent);
    this.root = root;
    const tabs = new Tabs<ForgeTab>(body, FORGE_TABS);
    caption(body, KEYS_HINT, LEATHER.y - 11);
    const sections: [ForgeTab, string, readonly ForgeItem[]][] = [
      ["catalog", "Armas e equipamento do ferreiro:", FORGE_CATALOG],
      ["recipes", "Receitas com materiais da caverna:", FORGE_RECIPES],
    ];
    for (const [tab, intro, items] of sections) {
      const layer = tabs.layer(tab);
      caption(layer, intro, LEATHER.y + 5, "hud-window-text");
      items.forEach((item, i) => forgeRow(layer, tooltip, item, LEATHER.y + 18 + i * FORGE_ROW));
      caption(layer, "A forja abre junto com a maestria de armas.", LEATHER.y + 26 + items.length * FORGE_ROW, "hud-window-text");
      this.coins.push(purse(layer));
    }
    tabs.select("catalog");
  }

  update(view: CityView) {
    for (const coins of this.coins) setText(coins, String(view.coins));
  }
}
