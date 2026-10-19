import { BASE_STATS, ITEMS, MAX_REDUCTION_PERCENT, REGEN_DELAY_MS, type ItemId } from "./balance";
import { EQUIP_SLOTS, type Equipment, type WeaponStats, weaponStats } from "./equipment";
import type { ItemStats } from "./inventory";

// Os 12 status do personagem. Vêm da base (BASE_STATS; a classe entra no passo 10), da arma equipada, dos bônus do
// equipamento e das essências absorvidas. Nível não dá status (só slots de essência).
//
// Combate:     Vida (maxHp), Mana (maxMana), Dano Físico, Dano Mágico, Defesa e Resistência Mágica (reduzem o dano
//              físico e o mágico recebido, em %), Velocidade de Ataque (encurta a recarga do golpe, em %).
// Exploração:  Velocidade (andar, px/s), Percepção (raio da luz que o personagem carrega, px: escuridão é raio de
//              replicação, regra 4), Furtividade (encurta a distância em que os mobs notam o personagem, em %).
// Sobrevivência: Vigor (a fome cai mais devagar, em %), Regeneração (vida por segundo, fora de combate).

// O que uma essência ou uma peça de equipamento soma aos status. Tudo opcional; bônus iguais se somam.
export interface StatBonus {
  maxHp?: number;
  maxMana?: number;
  physicalDamage?: number;
  magicDamage?: number;
  defensePercent?: number;
  magicResistPercent?: number;
  attackSpeedPercent?: number;
  // Velocidade de andar, em % da base.
  speedPercent?: number;
  // Px a mais no raio de luz.
  perception?: number;
  stealthPercent?: number;
  vigorPercent?: number;
  regenPerSecond?: number;
}

// Efeito de uma essência absorvida.
export type EssenceEffect = StatBonus;

export interface PlayerStats {
  maxHp: number;
  maxMana: number;
  // Dano do golpe: o da arma (ou do soco) mais os bônus.
  physicalDamage: number;
  magicDamage: number;
  // Reduções em % (de 0 a MAX_REDUCTION_PERCENT).
  defensePercent: number;
  magicResistPercent: number;
  attackSpeedPercent: number;
  // Px por segundo.
  speed: number;
  // Raio da luz que o personagem carrega, em px.
  lightRadius: number;
  stealthPercent: number;
  vigorPercent: number;
  regenPerSecond: number;
  // Alcance e arco do golpe (da arma, ou do soco).
  attack: WeaponStats;
}

// Uma redução em %: nunca negativa e nunca acima de MAX_REDUCTION_PERCENT (ninguém fica imune).
function reduction(percent: number): number {
  return Math.min(MAX_REDUCTION_PERCENT, Math.max(0, percent));
}

function bonusesOf(essences: readonly ItemId[], equipment: Equipment): StatBonus[] {
  const fromEssences = essences.map((item) => (ITEMS[item] as ItemStats).essence ?? {});
  const fromEquipment = EQUIP_SLOTS.flatMap((slot) => {
    const item = equipment[slot];
    const bonus = item && (ITEMS[item] as ItemStats).equip?.bonus;
    return bonus ? [bonus] : [];
  });
  return [...fromEssences, ...fromEquipment];
}

export function playerStats(essences: readonly ItemId[], equipment: Equipment = {}): PlayerStats {
  return statsFrom(bonusesOf(essences, equipment), weaponStats(equipment));
}

// Os status a partir da base, de uma lista de bônus e do golpe da arma, com os tetos aplicados.
export function statsFrom(bonuses: readonly StatBonus[], attack: WeaponStats): PlayerStats {
  const sum = (key: keyof StatBonus) => bonuses.reduce((total, bonus) => total + (bonus[key] ?? 0), 0);
  return {
    maxHp: BASE_STATS.maxHp + sum("maxHp"),
    maxMana: BASE_STATS.maxMana + sum("maxMana"),
    physicalDamage: attack.damage + sum("physicalDamage"),
    magicDamage: BASE_STATS.magicDamage + sum("magicDamage"),
    defensePercent: reduction(BASE_STATS.defensePercent + sum("defensePercent")),
    magicResistPercent: reduction(BASE_STATS.magicResistPercent + sum("magicResistPercent")),
    attackSpeedPercent: Math.max(0, BASE_STATS.attackSpeedPercent + sum("attackSpeedPercent")),
    speed: BASE_STATS.speed * (1 + sum("speedPercent") / 100),
    lightRadius: BASE_STATS.lightRadius + sum("perception"),
    stealthPercent: reduction(BASE_STATS.stealthPercent + sum("stealthPercent")),
    vigorPercent: reduction(BASE_STATS.vigorPercent + sum("vigorPercent")),
    regenPerSecond: Math.max(0, BASE_STATS.regenPerSecond + sum("regenPerSecond")),
    attack,
  };
}

// Tipo de dano recebido: físico (golpes de mob e de jogador) e mágico passam pela redução; "true" (fome) não.
export type DamageType = "physical" | "magic" | "true";

// Dano depois da Defesa (físico) ou da Resistência Mágica (mágico), em %.
export function damageTaken(amount: number, type: DamageType, stats: PlayerStats): number {
  if (type === "true") return amount;
  const percent = type === "physical" ? stats.defensePercent : stats.magicResistPercent;
  return amount * (1 - percent / 100);
}

// Regeneração: vida a recuperar neste tick. Só depois de REGEN_DELAY_MS sem levar dano, e nunca além da máxima.
export function regenerate(hp: number, stats: PlayerStats, dtMs: number, msSinceHurt: number): number {
  if (hp <= 0 || stats.regenPerSecond <= 0 || msSinceHurt < REGEN_DELAY_MS) return hp;
  return Math.min(stats.maxHp, hp + (stats.regenPerSecond * dtMs) / 1000);
}
