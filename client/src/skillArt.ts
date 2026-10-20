import type { SkillId } from "shared";
// Importadas direto (não por glob): o Vite só resolve um glob ao subir e não vê arquivo novo em assets/.
// Arte gerada por tools/assets/process_ui.py --skills.
import fireballUrl from "../../assets/ui/skill_fireball.png?url";
import lightningUrl from "../../assets/ui/skill_lightning.png?url";
import emptyUrl from "../../assets/ui/skill_slot_empty.png?url";
import swampUrl from "../../assets/ui/skill_swamp.png?url";
import tabletUrl from "../../assets/ui/ui_skills_tablet.png?url";

// Ícone de cada habilidade (64x64, com moldura de metal) e o do slot vazio.
export const SKILL_ICONS: Record<SkillId, string> = { fireball: fireballUrl, lightning: lightningUrl, swamp: swampUrl };
export const EMPTY_SKILL_ICON = emptyUrl;
export const SKILLS_TABLET = tabletUrl;
// Tecla de cada slot de habilidade.
export const SKILL_KEY_LABELS = ["Q", "R"] as const;
