# Decisões

Cada entrada registra **o que foi decidido e por quê**. O motivo importa mais que a escolha: é o que impede desfazer algo por engano meses depois.

Ordem cronológica. Entradas novas vão no fim.

---

## 2026-10 — Phaser 3 + Colyseus, não Unity

**Decisão:** cliente em Phaser 3, servidor em Colyseus (Node), TypeScript nos dois lados.

**Por quê:**
- Uma linguagem só nas duas pontas; aproveita a base de JS existente
- Colyseus tem modelo de salas que mapeia quase 1:1 na estrutura do jogo (vila = sala, cidade = sala, andar = sala instanciada)
- Distribuição por link de navegador: amigos entram sem baixar nada
- Unity exigiria aprender C# + Unity + solução de rede antes de o jogo existir

**Trade-off aceito:** Unity tem editor visual, iluminação 2D nativa, partículas melhores e caminho natural para Steam. Para 2D pixel art, a diferença no resultado visual final é pequena — o visual vem da arte, não da engine.

**Reavaliar se:** o projeto virar comercial, ou precisar de 3D.

---

## 2026-10 — Mapas à mão no Tiled, não geração procedural

**Decisão:** cada andar é um mapa fixo, desenhado no Tiled. Variação vem de spawn, entrada, portal e condições.

**Por quê:** o jogo é de sobrevivência difícil. Conhecer o terreno é recompensa legítima por morrer — é o que faz a quinta run parecer menos injusta que a primeira. O que não pode acontecer é o conhecimento **bastar**.

**Consequência técnica:** o layout é asset estático que cliente e servidor carregam igual. O servidor só persiste o que é dinâmico (jogadores, mobs, loot, fome).

---

## 2026-10 — Permadeath apenas no labirinto, com herança de linhagem

**Decisão:** o personagem morre em definitivo dentro do labirinto. Casa, baú, reputação de facção e bestiário persistem na linhagem.

**Por quê:** permadeath absoluto brigava com rotas de facção. Se virar paladino custa ~15h de missões e uma morte apaga isso, o jogador para de entrar no labirinto — o risco fica caro demais e o jogo morre pelo lado oposto ao pretendido.

**Alternativas descartadas:**
- Permadeath total com runs curtas (2–3h): exigiria encurtar todo o conteúdo de facção
- Sem permadeath: perde a tensão que é o centro do jogo

**Em aberto:** se maestria zera por completo ou se herda uma fração.

---

## 2026-10 — Status por essência, não por nível

**Decisão:** nível não dá status. Nível dá **slots** de essência (nível N = N essências equipadas). Status e habilidades vêm das essências.

**Por quê:**
- Essência é loot, então precisa ser extraída — o sistema de poder passa inteiro pelo loop de extração
- Slots não inflacionam números, só abrem combinações: dois jogadores de nível 5 podem ser completamente diferentes
- Com afinidade de área, não existe build universalmente forte, só build certo para o lugar certo

**Risco controlado:** sem teto, jogadores antigos viram deuses e o andar 1 fica trivial — o que destruiria o diferencial de dificuldade. Slots limitados + afinidade de área são o teto.

---

## 2026-10 — XP por primeira kill do bestiário + feitos

**Decisão:** XP vem da primeira kill de cada entrada do bestiário (variantes contam como entradas próprias) e de feitos.

**Por quê:** premia exploração em vez de farm, que é o comportamento que o jogo quer.

**Cuidado registrado:** é recurso finito — o bestiário define o teto de nível. Feitos cobrem os níveis altos sem exigir conteúdo infinito.

**Descartado:** feitos por tempo de permanência. São farmáveis sentado num canto seguro, o que é tempo de jogo sem jogo, e contradizem o loop de extração.

---

## 2026-10 — Troca de essência só na cidade, via igreja, com custo alto

**Decisão:** liberar slot exige purificação (destruição) da essência por NPC da igreja, a custo alto em moedas.

**Por quê:** se trocar fosse livre, o jogador carregaria o baú inteiro e otimizaria antes de cada entrada, esvaziando a escolha. Restringir à cidade mantém flexibilidade mas impede otimização dentro da dungeon.

**Efeito colateral desejado:** dá função mecânica real à facção da igreja, e abre espaço para um purificador clandestino na rota criminosa.

---

## 2026-10 — Top-down, não isométrico

**Decisão:** perspectiva top-down.

**Por quê:**
- Posição de tela = posição de mundo, sem conversão de coordenadas nos dois sentidos
- Ordenação de profundidade quase trivial (em isométrico, exige ordenar sprites a cada frame)
- Muito mais asset pack disponível
- Raio de visão circular de tocha fica mais natural

---

## 2026-10 — Autoridade total no servidor

**Decisão:** dano, fome, morte, loot e validação de movimento são calculados **só** no servidor. O cliente envia intenção e desenha o resultado.

**Por quê:** com permadeath, qualquer cálculo no cliente é vetor de cheat — um jogador com DevTools vira imortal.

**Caso específico — escuridão:** a zona escura é implementada como **raio de replicação menor** no servidor, não como efeito visual no cliente. Sem tocha, o servidor simplesmente não envia os mobs distantes. Assim não existe hack que "remova a escuridão", porque a informação nunca chegou. Isso aproveita o interest management que já é necessário por causa do tamanho dos andares.

---

## 2026-10 — Arte: placeholders primeiro

**Decisão:** quadrados coloridos até o jogo ser jogável. Escolha de tileset e sprites depois.

**Por quê:** movimento, combate e spawn vão ser reescritos várias vezes. Arte cedo prende em decisões que ainda vão mudar. Com o jogo jogável, dá para saber quantas direções de sprite, quantos frames e que tamanho de tile são necessários.

**Fontes previstas:** itch.io, OpenGameArt, Kenney. Escolher **um** pack/artista e puxar o resto dali, para o visual não ficar remendado.

---

## 2026-10 — Inspiração no manhwa: tom, não conteúdo

**Decisão:** o jogo se inspira em *Surviving the Game as a Barbarian* sem usar nomes, personagens, arte ou título da obra.

**Por quê:** direito autoral protege expressão, não ideia (Lei 9.610/98, art. 8º). Classe bárbaro, elfo, dungeon de andares, fome e permadeath são vocabulário comum de RPG, anterior à obra em décadas.

**Explicitamente não adotado:** a mecânica de "classe lixo" do manhwa. Funciona em narrativa com um protagonista; em multiplayer só esvaziaria uma das quatro vilas.

---

## 2026-10 — npm workspaces, `shared` consumido como fonte TypeScript

**Decisão:** um `package.json` na raiz com workspaces `client`, `server` e `shared`. Cada dependência é declarada no pacote que a usa. `shared` não tem build: seu `package.json` aponta `main`/`types` direto para `src/index.ts`.

**Por quê:**
- `shared` é o lugar das regras puras; um passo de build no meio criaria a chance de cliente e servidor rodarem versões diferentes da mesma regra
- Vite (cliente) e tsx (servidor) já transpilam TypeScript na hora, então o build seria custo sem ganho

**Como a resolução funciona (duas camadas, precisam concordar):**
- **Em execução:** o npm cria o symlink `node_modules/shared → shared/`, e Vite/tsx seguem o `main` até o `.ts`
- **No type-check e no editor:** `paths` no `tsconfig.json` de `client` e `server` aponta `shared` para `../shared/src`

Se uma das duas mudar, a outra tem que acompanhar.

**Versões fixadas por major:** Phaser 3.x (a stack exige Phaser 3; o npm já está no 4), TypeScript 5.9, Vite 5.4, vitest 2.1, tsx 4, Colyseus 0.18, Node 24 (`.nvmrc`). Existem majors mais novas (TypeScript 7, Vite 8) que não foram avaliadas. Subir uma delas é decisão própria, não atualização de rotina.

**Detalhe do Colyseus:** o transport é passado explicitamente (`WebSocketTransport` de `@colyseus/ws-transport`). Sem isso, o Colyseus tenta detectar o transport sozinho e quebra na inicialização se o pacote esperado não estiver instalado.

---

## 2026-10 — Movimento por WASD, cliente envia só as teclas

**Decisão:** o cliente envia quais teclas de direção estão apertadas (`up/down/left/right`), só quando mudam. O servidor aplica a velocidade a cada tick com `stepPosition` do `shared`.

**Por quê:** a única coisa que o cliente controla é "qual tecla". Velocidade, distância e posição são do servidor, então não há o que trapacear. O input é validado na entrada (`parseMoveInput`): qualquer valor que não seja exatamente `true` vira `false`.

**Descartado:** clicar para mover. Exige pathfinding pelo mapa, que só existe a partir do passo 2.

---

## 2026-10 — Sem previsão no cliente (por enquanto)

**Decisão:** o cliente só desenha o que o servidor manda. O próprio jogador responde com atraso igual ao ping.

**Por quê:** em localhost o atraso é ~0, e previsão com correção é o código mais difícil de depurar de um jogo em rede. O jogo premia planejamento, não reflexo (GDD), o que tolera um pouco de atraso.

**Reavaliar quando:** jogar pela internet com amigos começar a incomodar. Como `stepPosition` é pura e está no `shared`, o cliente poderá rodar a mesma função para prever.

---

## 2026-10 — Exceção temporária à regra 5 (interest management)

**Contraria:** a regra 5 do `CLAUDE.md`, "interest management sempre".

**Decisão:** no passo 1, o servidor replica todos os jogadores para todos.

**Por quê:** sem mapa, não há distância que faça sentido filtrar, e o filtro não teria como ser testado (os jogadores estariam sempre "perto"). Implementar agora seria código sem verificação.

**Prazo:** entra no passo 2, junto com o mapa, usando o `StateView` do Colyseus.

---

## 2026-10 — Estado do Colyseus fica no `server`, não no `shared`

**Decisão:** as classes de estado sincronizado (`schema()` do `@colyseus/schema`) ficam em `server/src/state.ts`. O `shared` usa tipos simples (`Vec2`, `MoveInput`). O cliente declara só o formato mínimo que lê (`ServerState` em `client/src/main.ts`).

**Por quê:** a regra 2 proíbe o `shared` de depender do Colyseus. Tipos simples bastam para as funções puras, e `PlayerState` tem `x`/`y`, então é aceito onde se espera um `Vec2`.

**Custo aceito:** o `ServerState` do cliente é uma cópia manual do formato. Se o estado no servidor mudar, o cliente precisa acompanhar à mão.

---

## 2026-10 — Parede marcada por propriedade `solid` no tileset

**Decisão:** um tile é parede se tiver a propriedade booleana `solid = true` no tileset. Vale para qualquer camada de tiles.

**Por quê:** é menos trabalho ao desenhar. Pinta-se o mapa uma vez só, sem manter uma segunda camada de colisão em sincronia com a arte.

**Alternativa descartada:** uma camada `collision` separada, onde qualquer tile pintado é parede.

**Custo aceito:** a colisão fica amarrada à arte. Quando o pack de tiles definitivo for escolhido (decisão "placeholders primeiro"), a propriedade `solid` terá que ser marcada de novo nos tiles do pack novo.

---

## 2026-10 — Colisão própria por grade, um eixo por vez

**Decisão:** função pura `moveWithCollision` em `shared/src/collision.ts`, sem biblioteca de física. A caixa do jogador anda primeiro em X, depois em Y. Em cada eixo, a borda da frente para encostada no primeiro tile sólido do caminho. Fora do mapa conta como parede.

**Por quê:**
- O mapa é uma grade de tiles; uma biblioteca de física seria uma caixa-preta grande para resolver um problema de ~40 linhas
- Mover um eixo por vez faz o jogador deslizar ao longo da parede em vez de grudar nela
- Verificar todas as células do caminho, e não só a de destino, impede atravessar parede num tick longo (lag no servidor)

**Limite conhecido:** só caixas contra tiles. Empurrão entre jogadores ou mobs, se for desejado, é outro problema.

---

## 2026-10 — Pontos de spawn no mapa, validados ao subir o servidor

**Decisão:** os pontos de entrada são objetos do tipo ponto numa camada de objetos `spawns` do Tiled. O servidor sorteia um a cada entrada. Ao subir, recusa o mapa se não houver pontos ou se algum deixar o jogador encostado em parede.

**Por quê:**
- O GDD pede ponto de entrada aleatório; marcar no mapa deixa quem desenha decidir onde, sem mexer em código
- Erro de mapa descoberto ao subir o servidor custa segundos. Descoberto quando um jogador nasce preso numa parede, custa uma run, e com permadeath isso é grave
- O sorteio recebe o número aleatório de fora (`pickSpawnPoint(points, random)`), então a regra continua pura e testável

**Em aberto:** a "restrição de área" do GDD. Quando existirem áreas (passo 3), cada ponto vai precisar dizer a que área pertence.

---

## 2026-10 — Interest management por raio, não por grade

**Contraria:** a palavra "grade" da regra 5 do `CLAUDE.md`. A intenção da regra, mandar a cada jogador só o que está perto, continua valendo.

**Decisão:** cada jogador recebe as entidades a até `VIEW_RADIUS` (520 px) dele. A distância é medida em círculo, com a função pura `shouldSee` em `shared/src/visibility.ts`. O servidor usa o `StateView` do Colyseus: a coleção `players` é marcada com `.view()`, e a cada tick o servidor adiciona ou remove os outros jogadores da visão de cada cliente. Quem está fora da visão não é enviado; o cliente recebe só um patch vazio.

**Por quê:**
- A regra 4 define escuridão como "raio de replicação menor". Com raio, escuridão é só passar um número menor para `shouldSee`, que já recebe o raio como parâmetro
- Uma grade de células de ~400 px seria grossa demais para uma tocha de ~150 px; precisaria de um raio por cima de qualquer jeito
- Com ~4 jogadores, checar distância contra centenas de entidades por tick é barato. Grade é otimização para muitos observadores, problema que o jogo não tem

**Detalhes:**
- 520 px passa da meia-diagonal da tela (500 px): em área iluminada, nada surge do nada dentro da tela
- Histerese de 32 px (`VIEW_HYSTERESIS`): quem já é visto só some além de 552 px. Sem isso, alguém parado na borda piscaria a cada tick
- O próprio jogador entra na visão ao conectar e nunca sai

**Encerra:** a exceção temporária à regra 5 aberta no passo 1.

**Reavaliar se:** o número de entidades ou de observadores crescer a ponto de a checagem por tick pesar. Aí entra uma grade como otimização *por baixo* do raio, sem mudar a regra.

---

## 2026-10 — Áreas: o Tiled desenha, o `balance.ts` configura

**Decisão:** áreas são retângulos com nome na camada `areas` do Tiled. Vários retângulos com o mesmo nome formam uma área só. Tudo o que o jogo sabe de cada área além do formato (se aceita entrada de jogador e, no passo 3b, quais mobs e quantos) fica em `AREAS`, no `shared/src/balance.ts`, indexado pelo nome.

**Por quê:**
- Retângulos tornam "este ponto está nesta área?" trivial e sem casos de borda; formas irregulares saem de vários retângulos
- Quantidade de mobs é número de balanceamento: pela regra 3, fica no `balance.ts`, ajustável sem abrir o Tiled
- O nome é a ponte entre os dois. O servidor recusa subir se os nomes não baterem nos dois sentidos, então um erro de digitação aparece na hora

**Descartado:** polígonos (mais código e casos de borda) e configuração nas propriedades do Tiled (espalharia números de balanceamento fora do `balance.ts`).

---

## 2026-10 — "Restrição de área" na entrada = só algumas áreas aceitam jogadores

**Decisão:** cada área diz se jogadores podem nascer nela (`playerEntry`). O sorteio de entrada usa só os pontos de spawn dessas áreas.

**Por quê:** o GDD dizia "ponto de entrada aleatório, com restrição de área" sem definir a restrição. A interpretação escolhida permite, por exemplo, que ninguém nasça dentro da zona escura dos goblins.

**Não adotado (por enquanto):** fazer o grupo todo entrar na mesma área. Cada jogador sorteia o próprio ponto.

---

## 2026-10 — Mobs nascem uma vez, em tiles de chão distintos da área

**Decisão:** quando a sala é criada, cada área recebe os mobs de `AREAS[área].mobs`. Cada mob vai para o centro de um tile de chão **diferente**, sorteado entre os tiles cujo centro está dentro da área (`planMobSpawns` em `shared/src/mobs.ts`). Os tipos e seus números (tamanho, velocidade) ficam em `MOB_KINDS` no `balance.ts`. A cor de cada tipo é só visual e fica no cliente.

**Por quê:**
- Sortear entre tiles conhecidos não depende de tentativa e erro, sempre termina e é fácil de testar com um gerador aleatório fixo
- Nenhum mob maior que um tile garante que qualquer tile de chão serve para qualquer tipo; o servidor recusa subir se isso for violado
- Tiles distintos evitam mobs empilhados no mesmo ponto

**Em aberto:** respawn. Hoje a população é fixa por run, o que combina com extraction game (o andar se esvazia conforme você mata), mas a regra fica para quando houver morte de mob (passo 4).

**Regra de estilo aplicada:** no cliente, o código que sincroniza os desenhos de jogadores e o de mobs ficou duplicado de propósito (dois usos). Generaliza no terceiro, provavelmente o loot no passo 6.

---

## 2026-10 — Mobs vagam presos à própria área, sem perseguir (ainda)

**Decisão:** no passo 3, cada mob alterna entre parado e andando numa direção aleatória, com durações sorteadas (`WANDER_IDLE_MS`, `WANDER_WALK_MS` no `balance.ts`). Se a parede ou a borda da área impedirem o próximo passo, ele para e a caminhada acaba. A regra é a função pura `stepWander` em `shared/src/wander.ts`. O estado da caminhada (direção, tempo restante) fica só no servidor e não é replicado.

**Por quê:**
- Exercita tick, colisão e visibilidade com muitas entidades se mexendo, antes de existir combate
- Perseguir jogador fica para o passo 4: sem ataque, perseguir seria meia funcionalidade, e a distância de "aggro" teria que ser reajustada quando houvesse dano
- Prender pelo centro do mob dentro da área deixa a área funcionar como limite invisível, sem precisar de parede no mapa
- Não replicar direção e tempo restante: o cliente não precisa disso para desenhar, e mandar seria entregar ao jogador para onde o mob vai antes de ele ir

**Em aberto:** respawn, a decidir pelo dono do projeto.

---

## 2026-10 — Golpe do jogador: clique mirado, arco à frente, fogo amigo

**Decisão:** clique esquerdo golpeia na direção do cursor. O cliente manda só o ângulo (`{ angle }`). O servidor confere a recarga (`PLAYER_ATTACK.cooldownMs`) e acerta tudo o que estiver no arco à frente (`arcDegrees`) dentro do alcance (`range`, contado da borda do alvo): mobs **e outros jogadores**. Só o próprio atacante fica de fora. Números em `PLAYER_ATTACK` e `PLAYER_MAX_HP`; vida dos mobs em `MOB_KINDS[...].maxHp`.

**Por quê:**
- Mirar com o mouse deixa WASD livre para andar enquanto mira, padrão de ARPG top-down (Hero Siege, referência do GDD)
- O ângulo é a única coisa que o cliente escolhe: recarga, alcance, quem foi atingido e dano são do servidor (regra 1). Ângulo que não seja número finito é ignorado
- Fogo amigo: escolha do dono do projeto. Mais tático e perigoso, combina com extraction game

**Como o golpe aparece para os outros:** o jogador tem no estado um contador de golpes (`attackSeq`) e o ângulo do último (`attackAngle`). Quem vê o jogador desenha o golpe quando o contador muda. Como passa pelo mesmo filtro de visão, quem está longe não fica sabendo.

**Limite conhecido:** o golpe não checa parede no meio. Com os números atuais isso não importa: dois corpos separados por uma parede de 1 tile ficam a pelo menos 52 px de centro a centro, e o maior alcance possível é 52 px (40 + metade de um jogador). Se o alcance subir, ou se paredes ficarem mais finas que um tile, o golpe passa a atravessar parede, e a linha de visão do 4b deve entrar aqui.

---

## 2026-10 — PROVISÓRIO: jogador a 0 de vida renasce na entrada

**Decisão:** até o passo 5, vida zero só manda o jogador de volta a um ponto de entrada, com vida cheia.

**Por quê:** a morte de verdade (permadeath, linhagem) é o passo 5. Até lá, renascer permite testar combate repetidamente. Fica marcado no código (`respawnPlayer` em `server/src/GameRoom.ts`) como provisório.

**Remover em:** passo 5.

---

## 2026-10 — Mobs perseguem pelo mapa inteiro

**Decisão do dono do projeto:** quando um mob nota um jogador, persegue-o para qualquer lugar do mapa, não só dentro da própria área.

**Consequências técnicas:**
- Exige pathfinding de verdade (A* na grade de tiles) para o mob passar pelas portas entre salas. Vira uma parte própria do passo 4 (4b)
- A regra de vagar (`stepWander`) exige que o mob esteja dentro da própria área. Um mob que desistiu longe de casa precisa voltar para a área antes de vagar de novo
- Ficam a decidir antes de implementar a perseguição (4c): se o mob enxerga através de parede, a que distância nota o jogador e a que distância desiste

---

## 2026-10 — Pathfinding A* em 8 direções, sem cortar quina; linha de visão com a mesma regra

**Decisão:** `findPath` (`shared/src/pathfinding.ts`) acha o caminho mais curto entre dois tiles, andando também na diagonal, mas só quando os dois vizinhos retos estão livres. `hasLineOfSight` (`shared/src/lineOfSight.ts`) percorre os tiles que a linha cruza; passando exatamente pela quina entre dois tiles, conta como bloqueada se qualquer um dos dois for parede.

**Por quê:**
- Diagonal deixa o movimento natural; sem ela, os mobs andariam em "escada"
- Não cortar quina é a mesma regra física da colisão: um caminho que corta quina mandaria o mob para um lugar onde a caixa dele trava na parede
- Linha de visão e caminho com a mesma regra de quina evitam o mob "ver" por uma fresta que não consegue atravessar

**Limite conhecido (pathfinding):** o A* explora o mapa inteiro se precisar. No mapa de teste (1.200 tiles) é instantâneo. Num andar grande, com muitos mobs recalculando caminho, pode pesar; aí entra um limite de tiles explorados ou recálculo menos frequente.

---

## 2026-10 — Cabeça dos mobs: notar com linha de visão, desistir ao perder de vista

**Decisão:** cada mob está em um de três modos (`stepMob` em `shared/src/mobAi.ts`). O modo fica só no servidor.

- **Vagando:** nota o jogador mais próximo que esteja dentro do `aggroRadius` do tipo **e** com linha de visão. Notou, persegue.
- **Perseguindo:** enquanto vê o alvo (até `VIEW_RADIUS`, com linha de visão), anda até ele pelo A* e para a `reach` de distância, de borda a borda. Sem ver, vai até onde o viu por último. Sem ver por `MOB_LOSE_TRACK_MS` (3 s), ou se o alvo sair da sala, desiste.
- **Voltando:** anda pelo A* até o tile de chão mais próximo da própria área e volta a vagar. Se notar alguém no caminho, persegue de novo.

**Por quê (escolhas do dono do projeto):**
- Linha de visão para notar: esconder-se atrás de parede funciona, o que é planejamento, não reflexo (GDD). Prepara furtividade e escuridão
- Raio de notar por tipo (`aggroRadius` em `MOB_KINDS`): abre espaço para variantes do bestiário com sentidos diferentes
- Desistir ao perder de vista por um tempo: fugir funciona, mas exige quebrar a linha de visão, não só correr

**Por quê (técnico):**
- Perseguindo, o mob enxerga até `VIEW_RADIUS`, mais longe que o raio de notar: uma vez em perseguição, é mais difícil escapar do que passar despercebido
- O caminho é recalculado só quando o tile do destino muda, não a cada tick
- O mob precisa voltar para a própria área porque `stepWander` só funciona dentro dela

**Limites conhecidos:** não há colisão entre mobs (vários perseguindo o mesmo jogador se sobrepõem). O caminho é recalculado conforme o alvo troca de tile; com muitos mobs perseguindo num andar grande, pode pesar (ver limite do pathfinding acima).
