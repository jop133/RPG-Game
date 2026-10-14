# Progresso

Onde o projeto está agora. Atualizado ao fim de cada passo. O porquê das escolhas fica em `DECISIONS.md`; aqui fica só o quê e o estado.

## Agora

**Passo 7 concluído: a fatia mínima jogável (passos 1 a 7) está completa.** Próximo: passo 8, maestria de armas.

O passo 7 foi feito em três partes:

- [x] **7a.** Persistência (SQLite) e identidade por nome: a linhagem e o personagem sobrevivem entre runs. Tela de nome ao entrar; um personagem vivo por linhagem; morreu, o próximo é herdeiro; extraído vira crédito da linhagem.
- [x] **7b.** Bestiário (da linhagem) e XP pela 1ª kill de cada tipo (por personagem, para quem dá o golpe final); nível = número de slots. HUD com nível e barra de XP; aviso de primeira morte.
- [x] **7c.** Essências: drop dos mobs; consumir (tecla do slot) ocupa um slot de essência, em qualquer lugar; efeito de status (velocidade, dano, vida máxima) aplicado pelo servidor; equipadas ficam no banco. Tirar só com NPC, mais à frente.

O passo 6 (inventário, loot, extração) foi feito em 6a, 6b e 6c.

**Limitações conhecidas agora:**
- Sem loja ainda: a comida de cada run são as 3 rações iniciais (`STARTING_ITEMS`), mais as que goblins largam às vezes.
- Uma run dura enquanto houver alguém na sala. Quando todos saem (ou morrem), a sala fecha e as pilhas no chão somem com ela.
- Pilhas no chão não somem com o tempo e mostram só a posição: o conteúdo se descobre ao pegar.
- O que é extraído vira "crédito" da linhagem no banco, mas ainda não serve para nada: usar vem com baú e loja (passo 9). Entre runs, o inventário zera (decisão do dono do projeto); toda run começa com as 3 rações.
- Identidade é só o nome, sem senha: quem digitar o seu nome entra como você. Serve para jogar entre amigos.
- Com só 2 tipos de mob, o nível máximo alcançável hoje é 3. Variantes e feitos (GDD) aumentam isso depois. O bestiário é registrado, mas ainda não tem tela.
- No co-op, o XP da primeira morte vai só para quem deu o golpe final.
- Ainda não dá para tirar essência (NPC de purificação vem com a cidade). Com os slots cheios, a essência fica no inventário e é recusada com aviso.
- As três essências são placeholders só de status. Habilidades únicas e afinidade de área (GDD) vêm com mais mobs e com a escuridão.
- A fatia do GDD pede "um andar, duas áreas, 3–4 mobs, duas armas e três essências": temos um andar de teste com 4 áreas, 2 tipos de mob, 1 arma e 3 essências. Faltam mobs e a segunda arma (que pertence ao passo 8).
- Vários mobs perseguindo o mesmo jogador se sobrepõem: não há colisão entre mobs.
- O aviso do golpe é desenhado no chão, por baixo dos quadrados: com o mob encostado, parte dele fica escondida sob o jogador. Rever quando houver arte.
- "Novo personagem" só recarrega a página. Quando houver cidade (passo 9), leva para lá.
- Fechar a aba perde o vínculo com o personagem (o token fica guardado por aba). Ele fica no mundo e morre de fome.
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
- [x] 5. Fome e morte
- [x] 6. Loot e extração
- [x] 7. Essências e slots ← fim da fatia mínima jogável
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

O banco fica em `data/rpg-extracao.db` (fora do git). Para usar outro arquivo, defina `DB_FILE` antes de subir o servidor.

**Ao abrir:** digite o nome da sua linhagem. O mesmo nome volta ao mesmo personagem (se vivo) ou entra um herdeiro (se o anterior morreu).

**Controles:** WASD anda. Clique esquerdo golpeia na direção do cursor (fogo amigo ligado: acerta outros jogadores também). As teclas **1–9, 0, - e =** usam o item do slot correspondente (ração: come uma; essência: consome e ocupa um slot de essência). **F** pega a pilha de loot mais próxima. Anel azul no chão: portal de saída; fique dentro dele 5 s para extrair. Barra amarela no canto superior esquerdo: sua fome. Embaixo, no centro: seu inventário.

## Como editar o mapa

O Tiled está instalado em `C:\Program Files\Tiled\tiled.exe`. Abra `assets/maps/test.json` direto nele.

- **Parede** é qualquer tile cuja propriedade `solid` (booleana) esteja marcada no tileset. No placeholder, o tile marrom.
- **O tileset precisa ficar embutido no mapa.** O Phaser não carrega tilesets externos (`.tsx`). Ao criar um tileset novo no Tiled, marque "Embed in map".
- **Saídas** ficam na camada de objetos `exits`, como pontos (atalho `I`). Cada um é um candidato; em cada run, `EXITS_ACTIVE` deles são sorteados. Cada candidato precisa caber o jogador sem encostar em parede, e o mapa precisa ter pelo menos um.
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
- **2026-10-14** — Morte por fome verificada de ponta a ponta (teste longo, ~6 min): fome zerou em 300,3 s; a vida caiu de 81,4 a 0 em 41 s (2/s); a morte chegou como "fome".
- **2026-10-14** — Passo 5c concluído, e com ele o passo 5. Reconexão (`onDrop` + `allowReconnection` no servidor; token por aba no cliente). Verificado por script: com a conexão caída, o corpo fica no mundo, na mesma posição, visível aos outros (sem a fome); a volta pelo token devolve o mesmo personagem, com a fome tendo continuado a cair; morto enquanto desconectado, a volta é recusada. No navegador: recarregar a página voltou ao mesmo personagem, no mesmo lugar.
- **2026-10-14** — Passo 6a concluído. Inventário (`shared/src/inventory.ts`; 143 testes no total) e comida. Verificado por script: entra com 3 rações, visíveis só para o dono; comer com a fome quase cheia não gasta ração. No navegador: barra de inventário embaixo ("Raç 3") e fome movida para o canto superior, para não sobrepor.
- **2026-10-14** — Comida revista a pedido do dono do projeto: em vez de **E** com regra de desperdício, o jogador usa a tecla do slot onde está a ração e come a qualquer momento, com qualquer fome (o excesso se perde). Verificado por script (slot 1 gastou uma ração; slot vazio e pedidos maliciosos não fizeram nada) e no navegador (tecla 1: "Raç 3" → "Raç 2", fome cheia).
- **2026-10-14** — Passo 6b concluído. Loot (`shared/src/loot.ts`; 155 testes no total). Verificado por script: rato morto deixou pilha e F levou a pele ao inventário (pilha sumiu); F longe da pilha não pegou nada; jogador morto por fogo amigo deixou as 3 rações, e quem pegou ficou com 6. No navegador: pilhas desenhadas onde os ratos morreram. A tecla F não foi exercitada no navegador (as teclas disparadas pela ferramenta de teste não chegaram ao jogo nessa carga da página); o mecanismo é o mesmo das teclas de slot, que funcionaram. Também no cliente: a sincronização de desenhos de jogadores, mobs e pilhas virou uma função só (terceiro uso).
- **2026-10-14** — Passo 6c concluído, e com ele o passo 6. Extração (`shared/src/extraction.ts`; 165 testes no total). Verificado por script num servidor de teste (andando até o portal com o `findPath` do jogo): 1,7 s dentro do portal → contagem 1743 ms; saiu → 0; voltou e ficou → "extracted" com a lista certa e conexão fechada com 4000. O servidor recusa um mapa sem saídas. **Não verificado no navegador:** na sala aberta, nenhum portal ativo caiu perto do spawn; o anel, a contagem na tela e a tela "Você extraiu" ficam para conferência manual.
- **2026-10-14** — Passo 7a concluído. SQLite com `better-sqlite3` e migrações numeradas (`server/src/db.ts`), nome validado em `shared/src/identity.ts` (170 testes no total). Verificado com banco descartável: nome inválido ou ausente recusado com mensagem; o mesmo nome em duas conexões recusado ("Teste já está no labirinto."); morte marca o personagem como morto e a próxima entrada cria um herdeiro na mesma linhagem; extrair soma o inventário no crédito da linhagem e o personagem segue vivo (voltar com o mesmo nome reencontra o mesmo personagem). No navegador: tela de nome, digitação de W/A/S/D no campo e mensagem de erro do servidor (sem entrar, para não sujar o banco do dono do projeto).
- **2026-10-14** — Passo 7b concluído. Bestiário e XP (migração 2 em `server/src/db.ts`; `shared/src/progression.ts`; 175 testes no total). Migração testada sobre um banco da versão 1: dados preservados, versão 2 aplicada. Verificado com banco descartável: entrar no nível 1; primeiro rato → aviso "subiu para o nível 2"; segundo rato → nada; sair e entrar de novo → nível 2 e 1 de XP vindos do banco; herdeiro começa com 0 de XP, mas o bestiário da linhagem continua. **Não verificado no navegador** (entrar exige nome e criaria linhagem no banco do dono do projeto): conferir o "Nível N · XP" e o aviso de primeira morte.
- **2026-10-14** — Passo 7c concluído, e com ele a fatia mínima jogável. Essências (`shared/src/essences.ts`, `useSlot` com resultados; migração 3; 182 testes no total). Verificado com banco descartável: personagem semeado com as 3 essências entrou com vida 125/125, andou 192 px em ~1 s (184 esperado; sem essência, 160) e um golpe deixou um rato de 20 com 6 (dano 14); essência caída de rato foi pega e consumida, equipada e gravada no banco (duas iguais se somam); com 3/3 slots, a próxima foi recusada com aviso e ficou no inventário. **Não verificado no navegador** (mesmo motivo): conferir a linha "Essências (n/slots)" e as cores das essências no inventário.
