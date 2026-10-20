import { type Area, type AreaConfig, areaAt } from "./areas";
import {
  ACID,
  BLEED,
  CRYSTAL_PULSE,
  FRENZY,
  MANA_REGEN_PER_SECOND,
  SHARDS,
  ZONE_EFFECTS,
  type MobKind,
} from "./balance";
import type { Vec2 } from "./movement";

// As 4 zonas hostis do labirinto (uma por canto) e o que cada uma faz com quem está nela. Tudo decidido no servidor
// (regra 1); o cliente usa as mesmas funções só para desenhar (qual zona, onde há poça).

export type ZoneId = "goblin" | "slime" | "lobo" | "gnomo";
export const ZONE_IDS: readonly ZoneId[] = ["goblin", "slime", "lobo", "gnomo"];

// O povo de cada zona (o que nasce nos grupos táticos dela).
export const ZONE_KIND: Record<ZoneId, MobKind> = { goblin: "goblin", slime: "slime", lobo: "lobo", gnomo: "gnomo" };

// Em que zona hostil o ponto está (pela área do mapa); fora delas, undefined.
export function zoneAt(areas: readonly Area[], configs: Readonly<Record<string, AreaConfig>>, p: Vec2): ZoneId | undefined {
  const area = areaAt(areas, p);
  return area ? configs[area.name]?.zone : undefined;
}

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------------------------------------------------------------- efeitos contínuos

// Raio de luz de quem está na zona (Breu dos Goblins).
export function zoneLightRadius(radius: number, zone: ZoneId | undefined): number {
  return zone === "goblin" ? radius * ZONE_EFFECTS.goblin.lightFactor : radius;
}

// Cura recebida na zona (Miasma dos Slimes).
export function zoneHeal(amount: number, zone: ZoneId | undefined): number {
  return zone === "slime" ? amount * ZONE_EFFECTS.slime.healFactor : amount;
}

// Quanto do tempo a fome anda na zona (Frio dos Lobos): o tick da fome usa dtMs x isto.
export function zoneHungerFactor(zone: ZoneId | undefined): number {
  return zone === "lobo" ? ZONE_EFFECTS.lobo.hungerFactor : 1;
}

// Dano recebido na zona (Ressonância dos Gnomos).
export function zoneDamage(amount: number, zone: ZoneId | undefined): number {
  return zone === "gnomo" ? amount * ZONE_EFFECTS.gnomo.damageTakenFactor : amount;
}

// Mana depois de dtMs: regenera MANA_REGEN_PER_SECOND; na zona dos gnomos a regeneração cai e há o dreno. Entre 0 e
// a máxima.
export function tickMana(mana: number, maxMana: number, zone: ZoneId | undefined, dtMs: number): number {
  const gnomo = zone === "gnomo";
  const regen = MANA_REGEN_PER_SECOND * (gnomo ? ZONE_EFFECTS.gnomo.manaRegenFactor : 1);
  const drain = gnomo ? ZONE_EFFECTS.gnomo.manaDrainPerSecond : 0;
  return Math.min(maxMana, Math.max(0, mana + ((regen - drain) * dtMs) / 1000));
}

// ---------------------------------------------------------------- goblins: olhos no escuro

// Goblins que já notaram o jogador (perseguindo ou atacando) e estão entre os limites de EYES: os olhos a desenhar.
export function goblinEyes(player: Vec2, goblins: readonly (Vec2 & { hunting: boolean })[]): Vec2[] {
  const { min, max } = ZONE_EFFECTS.goblin.eyes;
  return goblins.filter((g) => g.hunting && distance(g, player) >= min && distance(g, player) <= max).map(({ x, y }) => ({ x, y }));
}

// A tocha apagada mais perto, a até TORCH.interactRadius (para o [E]); undefined se nenhuma.
export function torchInReach<T extends Vec2 & { lit: boolean }>(player: Vec2, torches: Iterable<[string, T]>, radius: number): string | undefined {
  let best: string | undefined;
  let bestDistance = radius;
  for (const [id, torch] of torches) {
    const d = distance(player, torch);
    if (!torch.lit && d <= bestDistance) {
      best = id;
      bestDistance = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- slimes: poças ácidas

// Os pés de alguém (centro + `half` para baixo) em alguma poça.
export function inAcid(center: Vec2, half: number, puddles: readonly Vec2[]): boolean {
  const feet = { x: center.x, y: center.y + half };
  return puddles.some((p) => distance(feet, p) <= ACID.radius);
}

// ---------------------------------------------------------------- lobos: frenesi

// O lobo em `at` entra em frenesi se algum jogador na zona dos lobos, com pouca vida, está a até FRENZY.radius.
export function wolfFrenzy(at: Vec2, players: readonly (Vec2 & { hp: number; maxHp: number; zone: ZoneId | undefined })[]): boolean {
  return players.some((p) => p.zone === "lobo" && p.hp > 0 && p.hp < p.maxHp * FRENZY.hpFraction && distance(at, p) <= FRENZY.radius);
}

// ---------------------------------------------------------------- gnomos: descarga dos cristais, estilhaços, sangramento

// Fase da descarga de um cristal no instante `nowMs` (cada cristal com o seu atraso, para não pulsarem juntos):
// carregando nos últimos CHARGE_MS de cada período. `fired` diz se o disparo aconteceu entre `prevMs` e `nowMs`.
export function crystalPulse(prevMs: number, nowMs: number, offsetMs: number): { charging: boolean; fired: boolean } {
  const period = CRYSTAL_PULSE.periodMs;
  const phase = (((nowMs + offsetMs) % period) + period) % period;
  const fired = Math.floor((prevMs + offsetMs) / period) < Math.floor((nowMs + offsetMs) / period);
  return { charging: phase >= period - CRYSTAL_PULSE.chargeMs, fired };
}

// Empurrão da descarga: KNOCKBACK px para longe do cristal (de cima, se estiver bem em cima dele).
export function knockback(from: Vec2, target: Vec2): Vec2 {
  const d = distance(from, target);
  const dx = d > 1e-6 ? (target.x - from.x) / d : 0;
  const dy = d > 1e-6 ? (target.y - from.y) / d : -1;
  return { x: dx * CRYSTAL_PULSE.knockback, y: dy * CRYSTAL_PULSE.knockback };
}

// Estilhaços: até COUNT pontos de chão sorteados, a pelo menos MIN_SPACING px entre si.
export function scatterShards(cells: readonly Vec2[], random: () => number): Vec2[] {
  const shards: Vec2[] = [];
  for (let tries = 0; tries < SHARDS.count * 20 && shards.length < SHARDS.count && cells.length > 0; tries++) {
    const cell = cells[Math.floor(random() * cells.length)] as Vec2;
    if (shards.every((s) => distance(s, cell) >= SHARDS.minSpacing)) shards.push({ x: cell.x, y: cell.y });
  }
  return shards;
}

// O estilhaço que os pés de alguém (andando) pisaram agora, se algum.
export function shardUnderfoot<T extends Vec2>(center: Vec2, half: number, shards: Iterable<[string, T]>): string | undefined {
  const feet = { x: center.x, y: center.y + half };
  for (const [id, shard] of shards) if (distance(feet, shard) <= SHARDS.radius) return id;
  return undefined;
}

// Sangramento: dano deste tick e quanto falta dele.
export function tickBleed(remainingMs: number, dtMs: number): { damage: number; remainingMs: number } {
  if (remainingMs <= 0) return { damage: 0, remainingMs: 0 };
  const step = Math.min(remainingMs, dtMs);
  return { damage: (BLEED.damagePerSecond * step) / 1000, remainingMs: remainingMs - step };
}

// ---------------------------------------------------------------- teto de perseguidores

// Quem persegue quem (e a que distância): os que passam do teto por alvo, do mais longe para o mais perto, desistem.
export function excessChasers(chasers: readonly { id: string; targetId: string; distance: number }[], max: number): string[] {
  const byTarget = new Map<string, { id: string; distance: number }[]>();
  for (const c of chasers) byTarget.set(c.targetId, [...(byTarget.get(c.targetId) ?? []), c]);
  const out: string[] = [];
  for (const list of byTarget.values()) {
    if (list.length <= max) continue;
    out.push(...[...list].sort((a, b) => a.distance - b.distance).slice(max).map((c) => c.id));
  }
  return out;
}
