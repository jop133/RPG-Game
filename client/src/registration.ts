// Ficha de registro do aventureiro: tela do nome e tela da classe (personagem novo), com o carimbo no fim.
// É HTML por cima do jogo: layout fixo de 1280x720 ampliado por fator inteiro, para a pixel art ficar nítida.
// Só coleta a escolha; quem valida e grava nome e classe é o servidor (a entrada na sala).
import { CLASS_IDS, NAME_MAX_LENGTH, parsePlayerName, type ClassId } from "shared";
import "./registration.css";
import deskUrl from "../../assets/ui/desk.png?url";
import dialogueUrl from "../../assets/ui/dialogue.png?url";
import nameHeaderUrl from "../../assets/ui/name-header.png?url";
import sheetUrl from "../../assets/ui/sheet.png?url";
import titleHeaderUrl from "../../assets/ui/title-header.png?url";

const STAGE_W = 1280;
const STAGE_H = 720;
const DIRECTIONS = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"];
const PREVIEW_TURN_MS = 900;
const STAMP_MS = 600;
const FADE_MS = 500;

const SPRITES = import.meta.glob<string>("../../assets/characters/*/*.png", { eager: true, query: "?url", import: "default" });
function spriteUrl(classId: ClassId, direction: string): string {
  return SPRITES[`../../assets/characters/${classId}/${direction}.png`] ?? "";
}

// O que a ficha mostra de cada classe. As barras são descritivas (1 a 5): por enquanto a classe só fica registrada;
// os números de verdade entram no passo 10 (Classes e vilas), no balance.ts.
interface ClassInfo {
  label: string;
  summary: string;
  mechanic: string;
  stats: [number, number, number, number]; // vida, ataque/poder, velocidade, dificuldade
}
const CLASS_INFO: Record<ClassId, ClassInfo> = {
  mago: {
    label: "Mago",
    summary: "Mestre das artes arcanas.",
    mechanic: "Alto dano em área e controle de inimigos à distância com Mana.",
    stats: [2, 5, 3, 4],
  },
  elfo: {
    label: "Elfo",
    summary: "Atirador e duelista veloz.",
    mechanic: "Alta taxa de crítico, esquiva rápida e precisão letal.",
    stats: [3, 4, 5, 3],
  },
  barbaro: {
    label: "Bárbaro",
    summary: "Combatente brutal de linha de frente.",
    mechanic: "Usa Fúria e ataques pesados de curta distância.",
    stats: [5, 4, 2, 2],
  },
  homem_fera: {
    label: "Homem Fera",
    summary: "Predador ágil e resistente.",
    mechanic: "Acumula Instinto Bestial para ataques ferozes e transformação.",
    stats: [4, 4, 4, 3],
  },
};
// Nome da classe para mostrar (janela de inventário).
export function classLabel(id: string): string {
  return (CLASS_INFO as Record<string, ClassInfo | undefined>)[id]?.label ?? id;
}

const STAT_LABELS = ["Vida", "Ataque / Poder", "Velocidade", "Dificuldade"];
const STAT_COLORS = ["red", "gold", "gold", "red"];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, style: Partial<CSSStyleDeclaration> = {}) {
  const node = document.createElement(tag);
  node.className = className;
  Object.assign(node.style, style);
  return node;
}
function at(node: HTMLElement, left: number, top: number, width?: number, height?: number) {
  node.classList.add("reg-abs");
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  if (width !== undefined) node.style.width = `${width}px`;
  if (height !== undefined) node.style.height = `${height}px`;
  return node;
}
function image(src: string, left: number, top: number) {
  const img = el("img", "");
  img.src = src;
  img.draggable = false;
  img.alt = "";
  return at(img, left, top);
}
function threePart(className: string) {
  const box = el("div", `reg-three ${className}`);
  box.append(el("span", "l"), el("span", "m"), el("span", "r"));
  return box;
}
function button(text: string, left: number, top: number, width: number) {
  const b = at(el("button", "reg-button"), left, top, width) as HTMLButtonElement;
  b.type = "button";
  const label = el("span", "reg-button-text");
  label.textContent = text;
  b.append(threePart(""), label);
  return b;
}

export interface Registration {
  // Tela do nome. Resolve com um nome no formato aceito (o servidor ainda pode recusar: chame de novo com o erro).
  askName(error: string, initial: string): Promise<string>;
  // Tela da classe (personagem novo). Resolve depois do carimbo, com a classe escolhida.
  askClass(name: string): Promise<ClassId>;
  // Some com a ficha (fade-out). Chamar depois que a cidade já estiver na tela por baixo.
  close(): Promise<void>;
}

export function openRegistration(): Registration {
  const backdrop = el("div", "reg-backdrop");
  const stage = el("div", "reg-stage");
  backdrop.append(stage);
  document.body.append(backdrop);
  const fit = () => fitStage(stage);
  fit();
  window.addEventListener("resize", fit);

  let current: HTMLElement | undefined;
  const swap = (screen: HTMLElement) => {
    current?.remove();
    current = screen;
    stage.append(screen);
  };

  return {
    askName: (error, initial) =>
      new Promise((resolve) => {
        const screen = nameScreen(error, initial, resolve);
        swap(screen);
      }),
    askClass: (name) =>
      new Promise((resolve) => {
        swap(classScreen(name, resolve));
      }),
    close: () =>
      new Promise((resolve) => {
        backdrop.classList.add("reg-fading");
        window.setTimeout(() => {
          window.removeEventListener("resize", fit);
          backdrop.remove();
          resolve();
        }, FADE_MS);
      }),
  };
}

// Fator inteiro que cabe na janela (1x, 2x...); janela menor que 1280x720 usa o fator fracionário que couber.
function fitStage(stage: HTMLElement) {
  const fit = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${Math.round((window.innerWidth - STAGE_W * scale) / 2)}px`;
  stage.style.top = `${Math.round((window.innerHeight - STAGE_H * scale) / 2)}px`;
}

// ---------------------------------------------------------------- tela 1: nome

const DIALOGUE = { left: 296, top: 250 }; // dialogue.png: 688x224, papel da frente em x 33-650, y 48-175

function nameScreen(error: string, initial: string, done: (name: string) => void): HTMLElement {
  const screen = el("div", "reg-screen");
  screen.append(image(deskUrl, 256, 96));
  screen.append(image(titleHeaderUrl, 336, 14));
  const title = at(el("div", "reg-title"), 336, 74, 608);
  title.textContent = "RPG de Extração";
  const subtitle = at(el("div", "reg-subtitle"), 336, 196, 608);
  subtitle.textContent = "Registro de Aventureiro";
  screen.append(title, subtitle, image(dialogueUrl, DIALOGUE.left, DIALOGUE.top));

  const content = at(el("div", ""), DIALOGUE.left + 60, DIALOGUE.top + 54, 570, 116);
  const label = at(el("div", "reg-label"), 0, 0);
  label.textContent = "Nome do aventureiro";
  const field = at(el("div", ""), 0, 30, 570, 64);
  const input = el("input", "reg-input") as HTMLInputElement;
  input.maxLength = NAME_MAX_LENGTH;
  input.value = initial;
  input.spellcheck = false;
  input.autocomplete = "off";
  field.append(threePart("reg-field"), input);
  const message = at(el("div", "reg-error"), 0, 96, 570);
  message.textContent = error;
  content.append(label, field, message);
  screen.append(content);
  // O conteúdo "aparece" no papel: a máscara do pacote se dissolve por cima dele.
  screen.append(at(el("div", "reg-reveal-dialogue"), DIALOGUE.left + 30, DIALOGUE.top + 48));

  const hint = at(el("div", "reg-hint"), DIALOGUE.left, DIALOGUE.top + 236, 688);
  hint.style.textAlign = "center";
  hint.style.color = "#bfa985";
  hint.textContent = "De 2 a 16 letras, números, espaço, - ou _.  Enter confirma.";
  const go = button("Continuar para Escolha de Classe", 360, 560, 560);
  screen.append(hint, go);

  const submit = () => {
    const name = parsePlayerName(input.value);
    if (!name) {
      message.textContent = "Nome inválido: use de 2 a 16 letras, números, espaço, - ou _.";
      input.focus();
      return;
    }
    go.disabled = true;
    done(name);
  };
  go.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  window.setTimeout(() => input.focus(), 0);
  return screen;
}

// ---------------------------------------------------------------- tela 2: classe

const CARDS = { left: 96, top: 170, dx: 170, dy: 190 }; // grade 2x2
const PREVIEW = { left: 470, top: 200 };
const SHEET = { left: 790, top: 120 }; // sheet.png: 416x448, papel da frente em x 48-367, y 49-414

function classScreen(name: string, done: (classId: ClassId) => void): HTMLElement {
  const screen = el("div", "reg-screen");
  screen.append(image(nameHeaderUrl, 416, 6));
  const header = at(el("div", "reg-title"), 416, 36, 448);
  header.style.fontSize = "26px";
  header.textContent = `Aventureiro: ${name}`;
  screen.append(header);
  const sub = at(el("div", "reg-subtitle"), 96, 124, 340);
  sub.style.fontSize = "16px";
  sub.textContent = "Escolha sua classe";
  screen.append(sub);

  // Cards das quatro classes.
  const cards = CLASS_IDS.map((classId, i) => {
    const card = at(el("div", "reg-card"), CARDS.left + (i % 2) * CARDS.dx, CARDS.top + Math.floor(i / 2) * CARDS.dy);
    const holder = el("div", "reg-holder");
    const sprite = el("img", "reg-sprite") as HTMLImageElement;
    sprite.src = spriteUrl(classId, "south");
    sprite.alt = "";
    const label = el("div", "reg-card-name");
    label.textContent = CLASS_INFO[classId].label;
    card.append(holder, sprite, label);
    card.addEventListener("click", () => select(i));
    screen.append(card);
    return card;
  });
  const corners = ["tl", "tr", "br", "bl"].map((corner) => {
    const node = el("div", `reg-corner ${corner}`);
    screen.append(node);
    return node;
  });

  // Prévia grande, girando entre as 8 direções.
  const preview = at(el("div", "reg-preview"), PREVIEW.left, PREVIEW.top);
  const previewSprite = el("img", "") as HTMLImageElement;
  previewSprite.alt = "";
  preview.append(previewSprite);
  screen.append(preview);

  // Ficha com o nome da classe, descrição e barras.
  screen.append(image(sheetUrl, SHEET.left, SHEET.top));
  const banner = at(el("div", ""), SHEET.left + 56, SHEET.top + 18, 304, 80);
  banner.append(threePart("reg-banner"));
  const bannerText = el("div", "reg-banner-text");
  banner.append(bannerText);
  const desc = at(el("div", "reg-desc"), SHEET.left + 70, SHEET.top + 112, 280);
  const stats = STAT_LABELS.map((statLabel, i) => {
    const row = at(el("div", "reg-stat"), SHEET.left + 66, SHEET.top + 212 + i * 34, 290);
    const label = el("div", "reg-stat-label");
    label.textContent = statLabel;
    const bar = el("div", "reg-bar");
    const fill = el("div", "reg-fill");
    fill.append(threePart(STAT_COLORS[i] ?? "red"));
    bar.append(threePart("empty"), fill);
    row.append(label, bar);
    screen.append(row);
    return fill;
  });
  screen.append(banner, desc);
  screen.append(at(el("div", "reg-reveal-sheet"), SHEET.left + 64, SHEET.top + 64));
  // Marca do carimbo no pé da ficha, livre das barras (o papel da frente vai até y 414).
  const mark = at(el("div", "reg-stamp-mark"), SHEET.left + 272, SHEET.top + 344);
  screen.append(mark);

  const confirm = button("Confirmar Registro / Entrar na Cidade", 330, 628, 620);
  screen.append(confirm);

  let selected = 0;
  let turn = 0;
  const turnTimer = window.setInterval(() => {
    turn = (turn + 1) % DIRECTIONS.length;
    previewSprite.src = spriteUrl(CLASS_IDS[selected] ?? "mago", DIRECTIONS[turn] ?? "south");
  }, PREVIEW_TURN_MS);

  function select(i: number) {
    selected = (i + CLASS_IDS.length) % CLASS_IDS.length;
    const classId = CLASS_IDS[selected] ?? "mago";
    const info = CLASS_INFO[classId];
    cards.forEach((card, j) => card.classList.toggle("reg-active", j === selected));
    const card = cards[selected];
    if (card) {
      const x = parseInt(card.style.left) + 19;
      const y = parseInt(card.style.top);
      const spots = [[x - 10, y - 10], [x + 90, y - 10], [x + 90, y + 90], [x - 10, y + 90]];
      corners.forEach((corner, k) => at(corner, spots[k]?.[0] ?? 0, spots[k]?.[1] ?? 0));
    }
    turn = 0;
    previewSprite.src = spriteUrl(classId, "south");
    bannerText.textContent = info.label;
    desc.replaceChildren();
    const summary = el("b", "");
    summary.textContent = info.summary;
    const mechanic = el("span", "");
    mechanic.textContent = info.mechanic;
    desc.append(summary, mechanic);
    stats.forEach((fill, k) => (fill.style.width = `${((info.stats[k] ?? 0) / 5) * 160}px`));
  }

  // Setas ou A/D andam entre as classes; W/S e cima/baixo trocam de linha; Enter confirma.
  const onKey = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (key === "arrowleft" || key === "a") select(selected - 1);
    else if (key === "arrowright" || key === "d") select(selected + 1);
    else if (key === "arrowup" || key === "w" || key === "arrowdown" || key === "s") select(selected + 2);
    else if (key === "enter") stamp();
    else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey);

  // Carimbo desce sobre a ficha, a marca fica, e só então a escolha é entregue.
  function stamp() {
    if (confirm.disabled) return;
    confirm.disabled = true;
    window.removeEventListener("keydown", onKey);
    window.clearInterval(turnTimer);
    // A cabeça do carimbo fica no canto de baixo-esquerdo do quadro: assim ela desce em cima da marca.
    const tool = at(el("div", "reg-stamp"), SHEET.left + 246, SHEET.top + 216);
    screen.append(tool);
    window.setTimeout(() => {
      mark.classList.add("reg-on");
      tool.remove();
      done(CLASS_IDS[selected] ?? "mago");
    }, STAMP_MS);
  }
  confirm.addEventListener("click", stamp);

  select(0);
  return screen;
}
