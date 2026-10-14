# Progresso

Onde o projeto está agora. Atualizado ao fim de cada passo. O porquê das escolhas fica em `DECISIONS.md`; aqui fica só o quê e o estado.

## Agora

**Passo 5 em andamento: fome e morte** (sem linhagem: casa, baú, reputação e bestiário ficam para depois).

- [x] **5a.** Fome: cai no tick do servidor (cheia → vazia em 5 min); zerada, tira 2 de vida por segundo. Fome é privada: só o dono recebe. Barra "Fome" no canto da tela.
- [x] **5b.** Morte definitiva: vida 0 (por mob, outro jogador ou fome) tira o personagem da sala; tela "Você morreu" com a causa e botão "Novo personagem".
- [ ] **5c.** Desconexão: o personagem fica no mundo, a fome continua, e o jogador pode reconectar.

O passo 4 (combate, pathfinding, perseguição, golpe telegrafado) foi feito em 4a, 4b+4c e 4d.

**Limitações conhecidas agora:**
- **Ainda não dá para comer** (decisão: comida chega com inventário no passo 6). Toda run termina em morte por fome em ~6 minutos.
- Vários mobs perseguindo o mesmo jogador se sobrepõem: não há colisão entre mobs.
- O aviso do golpe é desenhado no chão, por baixo dos quadrados: com o mob encostado, parte dele fica escondida sob o jogador. Rever quando houver arte.
- "Novo personagem" só recarrega a página. Quando houver cidade (passo 9), leva para lá.
- Mobs atravessam jogadores e uns aos outros. Colisão é só contra parede.
- Mobs nascem só quando a sala é criada. **Respawn: decisão pendente do dono do projeto.**
- Os dois tipos de mob (`rato`, `goblin`) e as quantidades por área são placeholders do mapa de teste.
- O movimento dos outros deve parecer "em degraus" (o servidor atualiza 20× por segundo e o cliente desenha a 60). Se incomodar, a correção é interpolação, que é só visual.
- O mapa é um placeholder de teste (`assets/maps/test.json`). O andar 1 de verdade ainda vai ser desenhado.

## Ordem de construção

- [x] 0. Fundação: repositório, workspaces (`client`, `server`, `shared`), cliente e servidor subindo vazios
- [x] 1. Dois jogadores se movendo numa sala, se vendo
- [x] 2. Mapa do Tiled com colisão
- [x] 3. Mobs com spawn por área
- [x] 4. Combate e vida
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

**Controles:** WASD anda. Clique esquerdo golpeia na direção do cursor (fogo amigo ligado: acerta outros jogadores também). Barra amarela no canto inferior esquerdo: sua fome.

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
- **2026-10-13** — Passo 3c concluído, e com ele o passo 3. Mobs vagando (`shared/src/wander.ts`; 74 testes no total, incluindo uma simulação de 2.000 ticks que confere que nenhum mob sai da área nem entra em parede). Verificado por script: durante 10 s, os 8 mobs à vista se mexeram (ratos 195–474 px, goblins 116–202 px) e nenhum saiu da própria área. No navegador: mobs mudando de lugar entre capturas.
- **2026-10-14** — Passo 4a concluído. Vida e golpe do jogador (`shared/src/combat.ts`; 87 testes no total). Verificado por script: de 10 golpes em 1 s, só 2 aceitos (recarga de 500 ms); ângulo malicioso ignorado; rato morto em 2 golpes (20 → 10 → some); fogo amigo de 10 em 10 até 0, e o jogador volta com 100. No navegador: barras de vida em jogadores e mobs, sem erros no console. O leque do golpe (150 ms) não apareceu nas capturas de tela; conferir clicando.
- **2026-10-14** — Passo 4b concluído. `findPath` (A* em 8 direções, sem cortar quina) e `hasLineOfSight` em `shared/` (105 testes no total). Ainda sem uso no jogo: base da perseguição do 4c. Testes de mutação: liberar o corte de quina derruba 3 testes do pathfinding; tirar a regra da quina derruba o teste correspondente da linha de visão.
- **2026-10-14** — Passo 4c concluído. Cabeça dos mobs (`shared/src/mobAi.ts`: vagar / perseguir / voltar; 118 testes no total). Testes de mutação: notar sem linha de visão derruba 3 testes; tirar o pathfinding derruba o de contornar pela porta (o primeiro cenário desse teste não pegava isso e foi trocado). Verificado por script num servidor de teste: com linha de visão, um rato a 76 px veio e parou a 26,8 px (limite 28); afastando 1 s, ele seguiu e encostou de novo. Sem linha de visão (parede no meio), não perseguiu.
- **2026-10-14** — Passo 4d concluído, e com ele o passo 4. Golpe de mob telegrafado (modos `windup` e `recover` em `stepMob`, arco genérico `isInArc`; 124 testes no total). Verificado por script num servidor de teste: parado ao lado de um rato, o aviso apareceu e o golpe tirou exatamente 6 (100 → 94); recuando ao ver o aviso, o golpe saiu sem tirar vida. No navegador: arcos vermelhos saindo dos ratos na direção do jogador, aparecendo na preparação e sumindo na recuperação.
- **2026-10-14** — Passos 5a e 5b concluídos. Fome (`shared/src/hunger.ts`; 130 testes no total) e morte definitiva (causa em `shared/src/death.ts`). Verificado por script: fome cai ~1 a cada 3 s; cada jogador recebe só a própria fome (a vida dos outros continua visível); morte por fogo amigo e por rato chegam com a causa certa, o personagem some da sala e a conexão é fechada com código 4000. No navegador: barra de fome, tela "Você morreu / Morto por um rato." e "Novo personagem" entrando com personagem novo. Bug encontrado e corrigido no caminho: sem código de fechamento, o SDK tentava reconectar o morto.
