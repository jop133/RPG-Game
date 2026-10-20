import { GameRoom, arenaLevel } from "./GameRoom";

// A Sala de Testes (só com DEV_TOOLS=1): as mesmas regras do labirinto no mapa test_arena.json (gerado por
// tools/assets/build_test_arena.py), sem mobs de mapa, com um Boneco de Treino ao lado da chegada. Ninguém morre aqui
// (a vida para em 1). Ver CLAUDE.md.
export class SandboxRoom extends GameRoom {
  protected override level = arenaLevel();
  protected override sandbox = true;
}
