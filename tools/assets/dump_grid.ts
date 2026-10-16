// Grava a grade de colisão que o servidor monta de um mapa (parseCollisionGrid, a mesma do jogo) num JSON
// {width, height, solid: [bool...]}, para o render_map.py --solid pintar as paredes.
// Uso (da raiz do projeto): npx tsx tools/assets/dump_grid.ts assets/maps/city.json saida.json
import { readFileSync, writeFileSync } from "node:fs";
import { parseCollisionGrid, type TiledMap } from "../../shared/src/index";

const [mapPath, out] = process.argv.slice(2);
if (!mapPath || !out) throw new Error("Uso: npx tsx tools/assets/dump_grid.ts <mapa.json> <saida.json>");
const grid = parseCollisionGrid(JSON.parse(readFileSync(mapPath, "utf8")) as TiledMap);
writeFileSync(out, JSON.stringify({ width: grid.width, height: grid.height, solid: grid.solid }));
console.log(`ok ${out}: ${grid.solid.filter(Boolean).length} células sólidas`);
