import { CLASS_SKILLS, SKILLS, SKILL_SLOTS, parseClassId, type SkillId } from "shared";
import type { Send } from "./cityWindows";
import { el, image, place, setText, type Tooltip } from "./hudParts";
import { EMPTY_SKILL_ICON, SKILLS_TABLET, SKILL_ICONS, SKILL_KEY_LABELS } from "./skillArt";

// Tábua de Skills, aberta pelo botão "Skills" da janela de inventário, no mesmo lugar do pergaminho de Status. Fundo:
// a tábua de pedra e ferro (ui_skills_tablet.png, tools/assets/process_ui.py --skills). Dentro dela:
// - a plaquinha de cima com o título;
// - "Equipadas (máx. 2)": os slots Q e R (ícone da habilidade ou o slot vazio); botão direito ou o "x" desequipa;
// - "Habilidades liberadas": as da classe, com borda dourada nas equipadas; classe sem habilidades: cadeados, "Em breve";
// - o painel da habilidade escolhida: nome, descrição, recarga e "Equipar em Q" / "Equipar em R".
// Só pede (mensagem "equipSkill"); quem aceita ou recusa é o servidor (regra 1).

// Tamanho na tela (na proporção da arte, 693x967; a largura é a que ainda deixa a janela inteira caber numa tela de
// 1366 px, com as duas alas) e, em fração da arte, onde ficam a plaquinha do título e a área de dentro da moldura
// (medidas na arte).
export const TABLET = { w: 330, h: 460 };
const TITLE = { x: 0.31, y: 0.095, w: 0.38, h: 0.05 };
const INNER = { x: 0.15, y: 0.21, w: 0.7, h: 0.65 };
const SLOT = 56;
const SLOT_GAP = 28;
const LIBRARY_ICON = 48;
const LIBRARY_GAP = 12;
// Linhas da área de dentro (px a partir do topo dela): slots equipados, título e grade das liberadas, painel.
const ROWS = { slots: 18, library: 84, grid: 102, detail: 158 };
const LIBRARY_COLUMNS = 3; // também o número de cadeados "Em breve"

export interface SkillsView {
  classId: string;
  skills: readonly { id: SkillId | null }[];
}

export class SkillsTablet {
  readonly root: HTMLDivElement;
  private readonly slotIcons: HTMLImageElement[] = [];
  private readonly slotClears: HTMLButtonElement[] = [];
  private readonly library: HTMLDivElement;
  private readonly libraryIcons = new Map<SkillId, HTMLDivElement>();
  private readonly detail: { name: HTMLDivElement; text: HTMLDivElement; cooldown: HTMLDivElement; buttons: HTMLButtonElement[] };
  private classId = "";
  private equipped: (SkillId | null)[] = [];
  private selected?: SkillId;

  constructor(parent: HTMLElement, x: number, y: number, private readonly tooltip: Tooltip, private readonly send: Send) {
    this.root = place(el("div", "hud-abs hud-tablet", parent), x, y, TABLET.w, TABLET.h);
    this.root.hidden = true;
    const stone = place(el("img", "hud-abs", this.root), 0, 0, TABLET.w, TABLET.h);
    stone.src = SKILLS_TABLET;
    stone.alt = "";
    stone.draggable = false;
    const title = place(el("div", "hud-abs hud-tablet-title", this.root), TABLET.w * TITLE.x, TABLET.h * TITLE.y, TABLET.w * TITLE.w, TABLET.h * TITLE.h);
    title.textContent = "Habilidades";
    const inner = { x: TABLET.w * INNER.x, y: TABLET.h * INNER.y, w: TABLET.w * INNER.w, h: TABLET.h * INNER.h };
    const body = place(el("div", "hud-abs", this.root), inner.x, inner.y, inner.w, inner.h);

    // Equipadas: Q e R lado a lado, no meio.
    place(el("div", "hud-abs hud-tablet-section", body), 0, 0, inner.w).textContent = "Equipadas (máx. 2)";
    const slotsLeft = (inner.w - (SKILL_SLOTS * SLOT + (SKILL_SLOTS - 1) * SLOT_GAP)) / 2;
    for (let i = 0; i < SKILL_SLOTS; i++) this.equippedSlot(body, i, slotsLeft + i * (SLOT + SLOT_GAP), ROWS.slots);

    // Liberadas: a grade da classe (montada em update, quando a classe é conhecida).
    place(el("div", "hud-abs hud-tablet-section", body), 0, ROWS.library, inner.w).textContent = "Habilidades liberadas";
    this.library = place(el("div", "hud-abs", body), 0, ROWS.grid, inner.w, LIBRARY_ICON + 20);

    // Detalhes da escolhida.
    const panel = place(el("div", "hud-abs hud-tablet-detail", body), 0, ROWS.detail, inner.w, inner.h - ROWS.detail);
    const name = el("div", "hud-tablet-name", panel);
    const text = el("div", "hud-tablet-text", panel);
    const cooldown = el("div", "hud-tablet-cooldown", panel);
    const row = el("div", "hud-tablet-buttons", panel);
    const buttons = SKILL_KEY_LABELS.map((key, slot) => {
      const button = el("button", "hud-inv-status-btn hud-tablet-equip", row);
      button.type = "button";
      button.textContent = `Equipar em ${key}`;
      button.addEventListener("click", () => this.selected && this.equip(slot, this.selected));
      return button;
    });
    this.detail = { name, text, cooldown, buttons };
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean) {
    this.root.hidden = !open;
  }

  update(view: SkillsView) {
    if (view.classId !== this.classId) {
      this.classId = view.classId;
      this.buildLibrary();
    }
    this.equipped = view.skills.map((slot) => slot.id);
    this.slotIcons.forEach((icon, i) => {
      const id = this.equipped[i];
      const src = id ? SKILL_ICONS[id] : EMPTY_SKILL_ICON;
      if (icon.getAttribute("src") !== src) icon.src = src;
      const clear = this.slotClears[i];
      if (clear) clear.hidden = !id;
    });
    for (const [id, tile] of this.libraryIcons) {
      tile.classList.toggle("hud-tablet-equipped", this.equipped.includes(id));
      tile.classList.toggle("hud-tablet-selected", this.selected === id);
    }
    this.renderDetail();
  }

  private classSkills(): readonly SkillId[] {
    const classId = parseClassId(this.classId);
    return classId ? CLASS_SKILLS[classId] : [];
  }

  private equippedSlot(parent: HTMLElement, slot: number, x: number, y: number) {
    const key = SKILL_KEY_LABELS[slot] ?? "";
    const box = place(el("div", "hud-abs hud-tablet-slot", parent), x, y, SLOT, SLOT);
    const icon = place(el("img", "hud-abs", box), 0, 0, SLOT, SLOT);
    icon.alt = "";
    icon.draggable = false;
    icon.src = EMPTY_SKILL_ICON;
    this.slotIcons.push(icon);
    el("span", "hud-spell-key", box).textContent = key;
    const clear = place(el("button", "hud-abs hud-tablet-clear", box), SLOT - 18, 2, 16, 16);
    clear.type = "button";
    clear.textContent = "✕";
    clear.hidden = true;
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      this.unequip(slot);
    });
    this.slotClears.push(clear);
    box.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.unequip(slot);
    });
    box.addEventListener("click", () => {
      const id = this.equipped[slot];
      if (id) this.select(id);
    });
    this.tooltip.attach(box, () => {
      const id = this.equipped[slot];
      if (!id) return { title: `Slot [${key}] vazio`, lines: ["Escolha uma habilidade abaixo e equipe aqui."] };
      return { title: SKILLS[id].name, subtitle: `Equipada em [${key}]`, lines: [SKILLS[id].description], hint: "Botão direito ou ✕ para desequipar" };
    });
  }

  // A grade da classe: um ícone por habilidade. Sem habilidades ainda: cadeados com "Em breve".
  private buildLibrary() {
    this.library.replaceChildren();
    this.libraryIcons.clear();
    const skills = this.classSkills();
    this.selected = skills[0];
    const count = skills.length || LIBRARY_COLUMNS;
    const width = this.library.clientWidth || TABLET.w * INNER.w;
    const left = (width - (count * LIBRARY_ICON + (count - 1) * LIBRARY_GAP)) / 2;
    if (skills.length === 0) {
      for (let i = 0; i < LIBRARY_COLUMNS; i++) {
        const tile = place(el("div", "hud-abs hud-tablet-tile hud-tablet-locked", this.library), left + i * (LIBRARY_ICON + LIBRARY_GAP), 0, LIBRARY_ICON, LIBRARY_ICON);
        const empty = place(el("img", "hud-abs", tile), 0, 0, LIBRARY_ICON, LIBRARY_ICON);
        empty.src = EMPTY_SKILL_ICON;
        empty.alt = "";
        place(image("icon_lock", "hud-abs hud-lock", tile), (LIBRARY_ICON - 20) / 2, (LIBRARY_ICON - 20) / 2, 20, 20);
      }
      place(el("div", "hud-abs hud-tablet-soon", this.library), 0, LIBRARY_ICON + 4, width).textContent = "Em breve";
      return;
    }
    skills.forEach((id, i) => {
      const tile = place(el("div", "hud-abs hud-tablet-tile", this.library), left + i * (LIBRARY_ICON + LIBRARY_GAP), 0, LIBRARY_ICON, LIBRARY_ICON);
      const icon = place(el("img", "hud-abs", tile), 0, 0, LIBRARY_ICON, LIBRARY_ICON);
      icon.src = SKILL_ICONS[id];
      icon.alt = "";
      icon.draggable = false;
      // Clicar escolhe; se ela não está equipada e há um slot vazio, já equipa nele.
      tile.addEventListener("click", () => {
        this.select(id);
        const empty = this.equipped.indexOf(null);
        if (!this.equipped.includes(id) && empty >= 0) this.equip(empty, id);
      });
      this.tooltip.attach(tile, () => ({ title: SKILLS[id].name, subtitle: `Recarga ${SKILLS[id].cooldownMs / 1000} s`, lines: [SKILLS[id].description], hint: "Clique para ver e equipar" }));
      this.libraryIcons.set(id, tile);
    });
  }

  private select(id: SkillId) {
    this.selected = id;
    for (const [other, tile] of this.libraryIcons) tile.classList.toggle("hud-tablet-selected", other === id);
    this.renderDetail();
  }

  private renderDetail() {
    const { name, text, cooldown, buttons } = this.detail;
    const id = this.selected;
    if (!id) {
      setText(name, "Nenhuma habilidade ainda");
      setText(text, "As habilidades desta classe chegam em breve.");
      setText(cooldown, "");
      for (const button of buttons) button.disabled = true;
      return;
    }
    setText(name, SKILLS[id].name);
    setText(text, SKILLS[id].description);
    setText(cooldown, `Recarga: ${SKILLS[id].cooldownMs / 1000} s`);
    buttons.forEach((button, slot) => {
      button.disabled = this.equipped[slot] === id;
    });
  }

  private equip(slot: number, skill: SkillId) {
    this.send("equipSkill", { slot, skill });
  }

  private unequip(slot: number) {
    if (this.equipped[slot]) this.send("equipSkill", { slot, skill: null });
  }
}
