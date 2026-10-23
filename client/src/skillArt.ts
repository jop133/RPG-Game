import type { SkillId } from "shared";
// Importadas direto (não por glob): o Vite só resolve um glob ao subir e não vê arquivo novo em assets/.
// Arte gerada por tools/assets/process_ui.py --skills (a Barreira de Gelo, por process_magic.py; espíritos e urso, por
// process_forms.py).
import fireballUrl from "../../assets/ui/skill_fireball.png?url";
import iceBarrierUrl from "../../assets/ui/skill_ice_barrier.png?url";
import bearUrl from "../../assets/ui/skill_bear_transform.png?url";
import spiritEarthUrl from "../../assets/ui/skill_spirit_earth.png?url";
import spiritFireUrl from "../../assets/ui/skill_spirit_fire.png?url";
import spiritWaterUrl from "../../assets/ui/skill_spirit_water.png?url";
import spiritWindUrl from "../../assets/ui/skill_spirit_wind.png?url";
import lightningUrl from "../../assets/ui/skill_lightning.png?url";
import emptyUrl from "../../assets/ui/skill_slot_empty.png?url";
import swampUrl from "../../assets/ui/skill_swamp.png?url";
import tabletUrl from "../../assets/ui/ui_skills_tablet.png?url";

// Ícone de cada habilidade (64x64, com moldura de metal) e o do slot vazio.
export const SKILL_ICONS: Record<SkillId, string> = {
  fireball: fireballUrl,
  lightning: lightningUrl,
  swamp: swampUrl,
  ice_barrier: iceBarrierUrl,
  spirit_water: spiritWaterUrl,
  spirit_fire: spiritFireUrl,
  spirit_earth: spiritEarthUrl,
  spirit_wind: spiritWindUrl,
  bear_transform: bearUrl,
};
export const EMPTY_SKILL_ICON = emptyUrl;
export const SKILLS_TABLET = tabletUrl;
// Tecla de cada slot de habilidade.
export const SKILL_KEY_LABELS = ["Q", "R"] as const;
