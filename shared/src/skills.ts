import {
  BEAR_FORM,
  BUFF_BONUS,
  FIREBALL_SKILL,
  ICE_BARRIER,
  LIGHTNING_SPELL,
  SPIRIT_EARTH,
  SPIRIT_FIRE,
  SPIRIT_WATER,
  SPIRIT_WIND,
  SWAMP_SPELL,
} from "./balance";
import { CLASS_IDS, type ClassId } from "./classes";
import type { Vec2 } from "./movement";

// Habilidades (skills): cada classe tem as suas (CLASS_SKILLS) e todo personagem equipa até SKILL_SLOTS delas, uma por
// tecla (slot 0 = Q, slot 1 = R). Equipar e lançar são pedidos do cliente; quem decide é o servidor (regra 1).

export type SkillId =
  | "fireball"
  | "lightning"
  | "swamp"
  | "ice_barrier"
  | "spirit_water"
  | "spirit_fire"
  | "spirit_earth"
  | "spirit_wind"
  | "bear_transform";
export const SKILL_IDS: readonly SkillId[] = [
  "fireball",
  "lightning",
  "swamp",
  "ice_barrier",
  "spirit_water",
  "spirit_fire",
  "spirit_earth",
  "spirit_wind",
  "bear_transform",
];
// Os Espíritos Elementais do Elfo: só um equipado por vez (equipSkill troca o que já estava).
export const SPIRIT_SKILLS: readonly SkillId[] = ["spirit_water", "spirit_fire", "spirit_earth", "spirit_wind"];
export function isSpiritSkill(skill: SkillId | null | undefined): boolean {
  return skill !== null && skill !== undefined && SPIRIT_SKILLS.includes(skill);
}
// O espírito equipado ("water", "fire", "earth", "wind"), ou "" sem nenhum: é o que flutua ao lado do elfo.
export function spiritOf(equipped: EquippedSkills): string {
  const skill = equipped.find(isSpiritSkill);
  return skill ? skill.slice("spirit_".length) : "";
}
export const SKILL_SLOTS = 2;

// O que está em cada slot (null = vazio). Sempre SKILL_SLOTS posições.
export type EquippedSkills = readonly (SkillId | null)[];

export interface SkillInfo {
  name: string;
  description: string;
  cooldownMs: number;
}

export const SKILLS: Record<SkillId, SkillInfo> = {
  fireball: {
    name: "Bola de Fogo",
    description: "Projétil ígneo que explode no impacto e ilumina o caminho.",
    cooldownMs: FIREBALL_SKILL.cooldownMs,
  },
  lightning: {
    name: "Raio Celestial",
    description: `Um círculo arcano avisa por ${LIGHTNING_SPELL.warnMs / 1000} s; aí um relâmpago cai e fere todos na área.`,
    cooldownMs: LIGHTNING_SPELL.cooldownMs,
  },
  swamp: {
    name: "Pântano de Lama",
    description: `Lama borbulhante por ${SWAMP_SPELL.durationMs / 1000} s: monstros e outros jogadores ficam ${Math.round(
      (1 - SWAMP_SPELL.slow) * 100,
    )}% mais lentos nela.`,
    cooldownMs: SWAMP_SPELL.cooldownMs,
  },
  ice_barrier: {
    name: "Barreira de Gelo",
    description: `Ergue uma parede de gelo à sua frente, na direção da mira: os monstros não passam e os golpes deles batem nela (${ICE_BARRIER.hp} de vida, até ${ICE_BARRIER.durationMs / 1000} s).`,
    cooldownMs: ICE_BARRIER.cooldownMs,
  },
  spirit_water: {
    name: "Espírito da Água",
    description: `O espírito flutua ao seu lado. Na tecla, cura ${SPIRIT_WATER.heal} de vida em você e nos aliados próximos.`,
    cooldownMs: SPIRIT_WATER.cooldownMs,
  },
  spirit_fire: {
    name: "Espírito do Fogo",
    description: `O espírito flutua ao seu lado. Na tecla, lança uma bola de fogo na direção do mouse (${SPIRIT_FIRE.damage} de dano mágico).`,
    cooldownMs: SPIRIT_FIRE.cooldownMs,
  },
  spirit_earth: {
    name: "Espírito da Terra",
    description: `O espírito flutua ao seu lado. Na tecla, Pele de Pedra: +${BUFF_BONUS.stone_skin.defensePercent}% de Defesa por ${SPIRIT_EARTH.durationMs / 1000} s.`,
    cooldownMs: SPIRIT_EARTH.cooldownMs,
  },
  spirit_wind: {
    name: "Espírito do Vento",
    description: `O espírito flutua ao seu lado. Na tecla, Rajada: +${BUFF_BONUS.haste.speedPercent}% de Velocidade por ${SPIRIT_WIND.durationMs / 1000} s.`,
    cooldownMs: SPIRIT_WIND.cooldownMs,
  },
  bear_transform: {
    name: "Forma de Urso Primal",
    description: `Vira Homem-Urso por ${BEAR_FORM.durationMs / 1000} s: +${BUFF_BONUS.bear.maxHp} de Vida, +${BUFF_BONUS.bear.defensePercent}% de Defesa e golpe de garra (${BEAR_FORM.claws.damage}+${BUFF_BONUS.bear.physicalDamage} de dano). A tecla de novo volta à forma normal.`,
    cooldownMs: BEAR_FORM.cooldownMs,
  },
};

// As habilidades de cada classe. As outras classes ainda não têm (a janela mostra "Em breve").
export const CLASS_SKILLS: Record<ClassId, readonly SkillId[]> = {
  mago: ["fireball", "lightning", "swamp", "ice_barrier"],
  elfo: ["spirit_water", "spirit_fire", "spirit_earth", "spirit_wind"],
  barbaro: [],
  homem_fera: ["bear_transform"],
};

// Com o que cada classe entra equipada pela primeira vez.
const STARTING_SKILLS: Partial<Record<ClassId, EquippedSkills>> = { mago: ["fireball", "lightning"] };

const EMPTY: EquippedSkills = Array.from({ length: SKILL_SLOTS }, () => null);

export function startingSkills(classId: ClassId | undefined): EquippedSkills {
  return [...((classId && STARTING_SKILLS[classId]) ?? EMPTY)];
}

export function isClassSkill(skill: SkillId, classId: ClassId | undefined): boolean {
  return classId !== undefined && CLASS_IDS.includes(classId) && CLASS_SKILLS[classId].includes(skill);
}

// Gravado no personagem → em jogo. Nada gravado = o inicial da classe. Descarta o que não for skill da classe e as
// repetidas (uma skill fica num slot só).
export function restoreSkills(saved: unknown, classId: ClassId | undefined): EquippedSkills {
  if (saved === null || saved === undefined) return startingSkills(classId);
  const list = Array.isArray(saved) ? saved : [];
  const out: (SkillId | null)[] = [];
  for (let i = 0; i < SKILL_SLOTS; i++) {
    const skill = SKILL_IDS.find((id) => id === list[i]);
    const secondSpirit = isSpiritSkill(skill) && out.some(isSpiritSkill);
    out.push(skill && isClassSkill(skill, classId) && !out.includes(skill) && !secondSpirit ? skill : null);
  }
  return out;
}

// Vem do cliente: { slot, skill } com slot de 0 a SKILL_SLOTS - 1 e skill conhecida ou null (desequipar).
export function parseSkillEquip(raw: unknown): { slot: number; skill: SkillId | null } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { slot, skill } = raw as Record<string, unknown>;
  if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= SKILL_SLOTS) return undefined;
  if (skill === null) return { slot: slot as number, skill: null };
  const known = SKILL_IDS.find((id) => id === skill);
  return known ? { slot: slot as number, skill: known } : undefined;
}

// Põe `skill` no slot (null = esvazia). Skill que já está no outro slot troca de lugar com o que havia neste. Skill de
// outra classe, ou pedido que não muda nada: undefined. Espírito: o que já estava equipado em outro slot sai (nunca
// dois espíritos ao mesmo tempo).
export function equipSkill(equipped: EquippedSkills, slot: number, skill: SkillId | null, classId: ClassId | undefined): EquippedSkills | undefined {
  if (slot < 0 || slot >= SKILL_SLOTS || equipped[slot] === skill) return undefined;
  if (skill !== null && !isClassSkill(skill, classId)) return undefined;
  const out = [...equipped];
  const other = skill === null ? -1 : out.indexOf(skill);
  if (other >= 0) out[other] = out[slot] ?? null;
  out[slot] = skill;
  if (isSpiritSkill(skill)) out.forEach((s, i) => i !== slot && isSpiritSkill(s) && (out[i] = null));
  return out;
}

// Vem do cliente: lançar a skill do slot no ponto do mouse.
export function parseSkillCast(raw: unknown): { slot: number; target: Vec2 } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { slot, x, y } = raw as Record<string, unknown>;
  if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= SKILL_SLOTS) return undefined;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { slot: slot as number, target: { x, y } };
}
