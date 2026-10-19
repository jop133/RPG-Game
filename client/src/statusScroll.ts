import { REGEN_DELAY_MS, attackCooldownMs, type PlayerStats } from "shared";
import layout from "../../assets/ui/hud/layout.json";
// Importada direto (não pelo glob de ART em hudParts): o Vite só resolve um glob ao subir, e não vê arquivo novo em
// assets/, que fica fora da pasta do cliente. Assim a arte aparece mesmo num servidor que já estava rodando.
import scrollUrl from "../../assets/ui/hud/status_scroll.png?url";
import { el, place, setText } from "./hudParts";

// Pergaminho dos status, aberto pelo botão "Status" da janela de inventário, ao lado do personagem. Os 12 status em
// três grupos, cada um com o valor, o bônus sobre a base (essências e equipamento, em verde) e uma linha dizendo o que
// faz. Rola quando não cabe. Só desenho: os números vêm das mesmas regras puras de shared (playerStats).

const SCROLL = layout.status_scroll;

type Format = (value: number) => string;

const decimal = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const whole: Format = (value) => String(Math.round(value));
const percent: Format = (value) => `${decimal(value)}%`;
const perSecond: Format = (value) => `${decimal(value)}/s`;

interface StatRow {
  label: string;
  hint: string;
  value: (stats: PlayerStats) => number;
  format: Format;
}

const SECTIONS: readonly (readonly [string, readonly StatRow[]])[] = [
  [
    "Combate",
    [
      { label: "Vida", hint: "Vida máxima.", value: (s) => s.maxHp, format: whole },
      { label: "Mana", hint: "Gasta pelas habilidades de classe (em breve).", value: (s) => s.maxMana, format: whole },
      { label: "Dano Físico", hint: "Dano do golpe: o da arma (ou do soco) mais bônus.", value: (s) => s.physicalDamage, format: whole },
      { label: "Dano Mágico", hint: "Dano dos ataques mágicos (em breve).", value: (s) => s.magicDamage, format: whole },
      { label: "Defesa", hint: "Reduz o dano físico recebido.", value: (s) => s.defensePercent, format: percent },
      { label: "Resistência Mágica", hint: "Reduz o dano mágico recebido.", value: (s) => s.magicResistPercent, format: percent },
      { label: "Velocidade de Ataque", hint: "Golpes por segundo.", value: (s) => 1000 / attackCooldownMs(s), format: perSecond },
    ],
  ],
  [
    "Exploração",
    [
      { label: "Velocidade", hint: "Rapidez ao andar (pixels por segundo).", value: (s) => s.speed, format: whole },
      { label: "Percepção", hint: "Alcance da sua luz no escuro (pixels).", value: (s) => s.lightRadius, format: whole },
      { label: "Furtividade", hint: "Encurta a distância em que os monstros notam você.", value: (s) => s.stealthPercent, format: percent },
    ],
  ],
  [
    "Sobrevivência",
    [
      { label: "Vigor", hint: "A fome cai mais devagar.", value: (s) => s.vigorPercent, format: percent },
      {
        label: "Regeneração",
        hint: `Vida por segundo, ${REGEN_DELAY_MS / 1000} s depois do último dano.`,
        value: (s) => s.regenPerSecond,
        format: perSecond,
      },
    ],
  ],
];

interface RowView {
  row: StatRow;
  value: HTMLSpanElement;
  bonus: HTMLSpanElement;
}

export class StatusScroll {
  readonly root: HTMLDivElement;
  private readonly rows: RowView[] = [];

  constructor(parent: HTMLElement, x: number, y: number) {
    this.root = place(el("div", "hud-abs hud-scroll", parent), x, y, SCROLL.w, SCROLL.h);
    this.root.hidden = true;
    const paper = el("img", "hud-abs", this.root);
    paper.src = scrollUrl;
    paper.alt = "";
    paper.draggable = false;
    const { content } = SCROLL;
    const body = place(el("div", "hud-abs hud-scroll-body", this.root), content.x, content.y, content.w, content.h);
    el("div", "hud-scroll-title", body).textContent = "Status";
    for (const [title, rows] of SECTIONS) {
      el("div", "hud-scroll-section", body).textContent = title;
      for (const row of rows) {
        const line = el("div", "hud-scroll-row", body);
        const top = el("div", "hud-scroll-row-top", line);
        el("span", "hud-scroll-label", top).textContent = row.label;
        const value = el("span", "hud-scroll-value", top);
        const bonus = el("span", "hud-scroll-bonus", top);
        el("div", "hud-scroll-hint", line).textContent = row.hint;
        this.rows.push({ row, value, bonus });
      }
    }
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean) {
    this.root.hidden = !open;
  }

  // `base`: os mesmos status sem bônus (só a base e o golpe da arma), para mostrar quanto vem de essência e equipamento.
  update(stats: PlayerStats, base: PlayerStats) {
    for (const { row, value, bonus } of this.rows) {
      const now = row.value(stats);
      const extra = now - row.value(base);
      setText(value, row.format(now));
      const shown = Math.abs(extra) < 0.05 ? "" : `(${extra > 0 ? "+" : "−"}${row.format(Math.abs(extra))})`;
      setText(bonus, shown);
      bonus.classList.toggle("hud-scroll-bonus-down", extra < 0);
    }
  }
}
