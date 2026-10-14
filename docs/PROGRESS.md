# Progresso

Onde o projeto está agora. Atualizado ao fim de cada passo. O porquê das escolhas fica em `DECISIONS.md`; aqui fica só o quê e o estado.

## Agora

**Passo 2 em andamento.** Dividido em três partes, um commit cada:

- [x] **2a.** Mapa e colisão: o servidor carrega o mapa do Tiled e bloqueia paredes; o cliente desenha o mapa e a câmera segue o jogador.
- [x] **2b.** Spawn vindo do mapa (pontos marcados no Tiled, servidor sorteia).
- [ ] **2c.** Interest management por grade (exceção à regra 5 aberta no passo 1).

**Limitações conhecidas agora:**
- O sorteio de spawn é entre todos os pontos do mapa. A restrição por área do GDD entra quando houver áreas (passo 3).
- O servidor replica todos os jogadores para todos. Resolve no 2c.
- O movimento dos outros deve parecer "em degraus" (o servidor atualiza 20× por segundo e o cliente desenha a 60). Se incomodar, a correção é interpolação, que é só visual.
- O mapa é um placeholder de teste (`assets/maps/test.json`). O andar 1 de verdade ainda vai ser desenhado.

## Ordem de construção

- [x] 0. Fundação: repositório, workspaces (`client`, `server`, `shared`), cliente e servidor subindo vazios
- [x] 1. Dois jogadores se movendo numa sala, se vendo
- [ ] 2. Mapa do Tiled com colisão
- [ ] 3. Mobs com spawn por área
- [ ] 4. Combate e vida
- [ ] 5. Fome e morte
- [ ] 6. Loot e extração
- [ ] 7. Essências e slots ← fim da fatia mínima jogável
- [ ] 8. Maestria de armas
- [ ] 9. Cidade, loja, baú
- [ ] 10. Classes e vilas
- [ ] 11. Facções e rotas sociais

## Como rodar

Todos os comandos rodam **de dentro da pasta do projeto** (`rpg-extracao`), não da pasta acima dela. Servidor e cliente rodam ao mesmo tempo, cada um no seu terminal.

```bash
cd C:\Users\User\Desktop\Claude\Sessions\rpg-extracao
npm install
npm run dev:server   # Colyseus em http://localhost:2567
npm run dev:client   # Vite em http://localhost:5173
npm test             # testes de shared/
```

## Como editar o mapa

O Tiled está instalado em `C:\Program Files\Tiled\tiled.exe`. Abra `assets/maps/test.json` direto nele.

- **Parede** é qualquer tile cuja propriedade `solid` (booleana) esteja marcada no tileset. No placeholder, o tile marrom.
- **O tileset precisa ficar embutido no mapa.** O Phaser não carrega tilesets externos (`.tsx`). Ao criar um tileset novo no Tiled, marque "Embed in map".
- **Pontos de entrada** ficam na camada de objetos `spawns`, criados com a ferramenta "Insert Point" (atalho `I`). Retângulos nessa camada são recusados. O jogador nasce centrado no ponto, e cada ponto precisa ter espaço para a caixa dele (24×24 px) sem encostar em parede.
- **O servidor valida o mapa ao subir.** Sem pontos de spawn, ou com um ponto encostando em parede, ele não sobe e diz qual ponto está errado.
- **Formato da camada: CSV.** Se for comprimido (Base64/zlib), o servidor recusa o mapa com um erro dizendo isso.
- **Depois de salvar o mapa, reinicie o servidor.** O modo watch recarrega quando o código muda, mas não quando o mapa muda. O cliente recarrega sozinho.

## Histórico

- **2026-10-13** — Passo 0 concluído. Repositório criado, workspaces configurados, Phaser 3.90 e Colyseus 0.18 subindo sem erro.
- **2026-10-13** — Passo 1 concluído. Movimento WASD autoritativo no servidor (`shared/src/movement.ts`, 8 testes). Verificado com duas abas: cada uma vê a outra andar, e o quadrado de quem sai some. Verificado também por script: 160 px/s medidos no servidor, input malicioso ignorado.
- **2026-10-13** — Passo 2a concluído. Colisão contra tiles `solid` (`shared/src/collision.ts`, `shared/src/tiledMap.ts`, 25 testes no total). Mapa placeholder 40×30 gerado e conferido no Tiled 1.12.2 (abre e exporta igual). Verificado por script: o jogador para exatamente encostado na parede, desliza na diagonal e não sai pela borda. No navegador: mapa desenhado e câmera seguindo.
- **2026-10-13** — Passo 2b concluído. Spawn sorteado entre os pontos da camada `spawns` do mapa (`shared/src/spawn.ts`; 36 testes no total). Verificado por script: 12 entradas caíram só nos 4 pontos do mapa, usando todos. O servidor recusa subir com um ponto em cima de parede ou sem pontos, com mensagem dizendo qual.
