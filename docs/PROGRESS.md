# Progresso

Onde o projeto está agora. Atualizado ao fim de cada passo. O porquê das escolhas fica em `DECISIONS.md`; aqui fica só o quê e o estado.

## Agora

**Passo 3 em andamento: mobs com spawn por área.** Dividido em três partes, um commit cada:

- [x] **3a.** Áreas no mapa (retângulos com nome no Tiled, configuração em `AREAS` no `balance.ts`). Jogador só entra por pontos em áreas com `playerEntry: true`.
- [x] **3b.** Mobs nascem em posições aleatórias dentro de cada área, conforme `AREAS`; replicados por raio como os jogadores.
- [ ] **3c.** Mobs vagam dentro da própria área.

O passo 2 (mapa, colisão, spawn e interest management) foi feito em três partes: 2a, 2b e 2c.

**Limitações conhecidas agora:**
- Mobs ainda ficam parados (3c resolve). Também não têm vida nem atacam: combate é o passo 4.
- Mobs nascem só quando a sala é criada. Não há respawn: ainda não existe como morrer, e a regra de respawn não está decidida.
- Os dois tipos de mob (`rato`, `goblin`) e as quantidades por área são placeholders do mapa de teste.
- O movimento dos outros deve parecer "em degraus" (o servidor atualiza 20× por segundo e o cliente desenha a 60). Se incomodar, a correção é interpolação, que é só visual.
- O mapa é um placeholder de teste (`assets/maps/test.json`). O andar 1 de verdade ainda vai ser desenhado.

## Ordem de construção

- [x] 0. Fundação: repositório, workspaces (`client`, `server`, `shared`), cliente e servidor subindo vazios
- [x] 1. Dois jogadores se movendo numa sala, se vendo
- [x] 2. Mapa do Tiled com colisão
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
- **Áreas** ficam na camada de objetos `areas`: retângulos ("Insert Rectangle", atalho `R`) com nome. Vários retângulos com o mesmo nome formam uma área de formato irregular. Outros formatos (elipse, polígono) são recusados.
- **Toda área do mapa precisa de uma entrada com o mesmo nome em `AREAS`** (`shared/src/balance.ts`), e vice-versa. É lá que se diz se jogadores podem entrar por ela (`playerEntry`) e quais mobs nascem nela, e quantos (`mobs`). Os tipos de mob ficam em `MOB_KINDS`, no mesmo arquivo; nenhum mob pode ser maior que um tile.
- **Mobs nascem em tiles de chão diferentes dentro da área.** Se uma área pedir mais mobs do que tem tiles de chão, o servidor não sobe.
- **Todo ponto de spawn precisa estar dentro de uma área.** Só os pontos em áreas com `playerEntry: true` são usados para jogadores.
- **O servidor valida o mapa ao subir** e lista todos os problemas de uma vez: área sem configuração (ou o contrário), ponto de spawn fora de área ou encostando em parede, nenhuma área com entrada.
- **Formato da camada: CSV.** Se for comprimido (Base64/zlib), o servidor recusa o mapa com um erro dizendo isso.
- **Depois de salvar o mapa, reinicie o servidor.** O modo watch recarrega quando o código muda, mas não quando o mapa muda. O cliente recarrega sozinho.

## Histórico

- **2026-10-13** — Passo 0 concluído. Repositório criado, workspaces configurados, Phaser 3.90 e Colyseus 0.18 subindo sem erro.
- **2026-10-13** — Passo 1 concluído. Movimento WASD autoritativo no servidor (`shared/src/movement.ts`, 8 testes). Verificado com duas abas: cada uma vê a outra andar, e o quadrado de quem sai some. Verificado também por script: 160 px/s medidos no servidor, input malicioso ignorado.
- **2026-10-13** — Passo 2a concluído. Colisão contra tiles `solid` (`shared/src/collision.ts`, `shared/src/tiledMap.ts`, 25 testes no total). Mapa placeholder 40×30 gerado e conferido no Tiled 1.12.2 (abre e exporta igual). Verificado por script: o jogador para exatamente encostado na parede, desliza na diagonal e não sai pela borda. No navegador: mapa desenhado e câmera seguindo.
- **2026-10-13** — Passo 2b concluído. Spawn sorteado entre os pontos da camada `spawns` do mapa (`shared/src/spawn.ts`; 36 testes no total). Verificado por script: 12 entradas caíram só nos 4 pontos do mapa, usando todos. O servidor recusa subir com um ponto em cima de parede ou sem pontos, com mensagem dizendo qual.
- **2026-10-13** — Passo 2c concluído, e com ele o passo 2. Interest management por raio (`shared/src/visibility.ts`, 42 testes no total) usando `StateView` do Colyseus. Verificado com dois clientes de script: 10 pares em spawns aleatórios, todos com visibilidade correta; aproximar faz aparecer, afastar faz sumir. Verificado na rede: com o outro jogador fora do raio e andando, o cliente recebe só patches vazios de 1 byte, nenhum dado sobre ele.
- **2026-10-13** — Passo 3a concluído. Áreas no mapa (`shared/src/areas.ts`; 58 testes no total) e 4 áreas no mapa de teste (`salao`, `galeria`, `tuneis`, `toca`). Carregamento e validação do mapa movidos para `server/src/level.ts`. Verificado por script: 16 entradas caíram só em `salao` e `tuneis`. Com um mapa estragado de propósito, o servidor listou os três problemas juntos.
- **2026-10-13** — Passo 3b concluído. Mobs por área (`shared/src/mobs.ts`; 66 testes no total), dois tipos placeholder em `MOB_KINDS`, replicados por raio como os jogadores. Verificado por script: um jogador em cada área de entrada, todos os mobs recebidos em tile de chão, na área certa, do tipo certo e dentro do raio; quem está no `salao` vê os 3 ratos dele. Com uma área encolhida de propósito, o servidor recusou subir. No navegador: mobs desenhados com cor por tipo.
