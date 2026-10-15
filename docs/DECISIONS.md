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

## 2026-10 — ~~PROVISÓRIO: jogador a 0 de vida renasce na entrada~~ (removido no passo 5b)

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

---

## 2026-10 — Golpe de mob telegrafado: arco travado, não interrompível

**Decisão:** ao encostar no alvo à vista (`reach`), o mob para e prepara o golpe por `windupMs`, com a direção **travada** no início. No fim, acerta todos os jogadores no arco (`attackArcDegrees`, até `attackReach` de borda a borda), não só o alvo, com `attackDamage`. Depois fica parado por `recoverMs` e volta a perseguir. Tudo por tipo em `MOB_KINDS`. Mob não fere mob.

O cliente recebe `windup` e `attackAngle` e desenha o arco no chão: o contorno é a área atingida e o preenchimento cresce até a borda no tempo da preparação.

**Por quê (escolhas do dono do projeto):**
- **Arco travado:** dá para "ler" para onde o golpe vai e sair de lado. Premia posicionamento, e usa a mesma geometria do golpe do jogador (`isInArc`)
- **Não interrompível:** a escolha do jogador é "bato e fico" ou "saio da área". Mantém o mob perigoso e evita que 4 jogadores travem um mob para sempre batendo nele. Interromper pode virar traço de variante depois

**Por quê (técnico):**
- `attackReach` maior que `reach`: o mob para mais perto do que o golpe alcança. Esquivar exige sair do arco de verdade, não só um passo para trás no último instante
- O telegrafo é a única parte da cabeça do mob enviada ao cliente, e é de propósito: o GDD quer que morrer seja consequência de decisão, e para decidir o jogador precisa ver o aviso
- O cliente cronometra o enchimento a partir de quando viu a preparação começar. A imprecisão (até um patch, ~50 ms) é só visual; o golpe sai na hora do servidor

**Valores iniciais:** rato prepara 500 ms, tira 6, alcance 24, arco 90°, recupera 600 ms; goblin prepara 800 ms, tira 15, alcance 32, arco 100°, recupera 900 ms.

---

## 2026-10 — Passo 5 sem linhagem: nada é guardado entre sessões, por enquanto

**Decisão do dono do projeto:** o passo 5 traz fome e morte definitiva, mas não a linhagem (casa, baú, reputação, bestiário). Essas coisas chegam depois, junto com a cidade.

**Consequência:** ainda não existe persistência. Um personagem existe só enquanto a sala existe. A escolha de onde guardar dados (arquivo, SQLite, outro) fica para quando houver algo que precise sobreviver a uma sessão.

---

## 2026-10 — Fome: cai sempre, zerada tira vida, é privada

**Decisão:**
- A fome começa em `HUNGER_MAX` e cai `HUNGER_DECAY_PER_SECOND` no tick do servidor (regra 6). Com os valores iniciais, esvazia em 5 minutos
- Zerada, tira `STARVATION_DAMAGE_PER_SECOND` de vida (2 por segundo) até comer ou morrer
- Ainda não dá para comer: comida chega como item, com inventário, no passo 6 (escolha do dono do projeto)
- Só o dono recebe a própria fome: o campo é marcado com `.view(OWNER_TAG)`, e só a visão do próprio jogador é criada com essa tag. Os outros veem a vida, não a fome

**Por quê:**
- Perder vida aos poucos (em vez de morrer na hora) dá uma janela para reagir, o que é decisão, não reflexo (GDD)
- Fome privada: o cliente só recebe o que precisa. Saber quem do grupo está faminto pode virar mecânica (ou habilidade) depois, mas não de graça

---

## 2026-10 — Morte definitiva: sai da sala, tela com a causa

**Decisão:** toda perda de vida de jogador passa por `damagePlayer`, que registra a causa (`DeathCause` em `shared/src/death.ts`: fome, mob de tal tipo, outro jogador). No fim do tick (ou do golpe), `resolveDeaths` manda a mensagem `death` com a causa, tira o personagem da sala e fecha a conexão com `CloseCode.CONSENTED`. O cliente mostra "Você morreu", a causa e o botão "Novo personagem", que por enquanto só recarrega a página e entra de novo.

**Por quê:**
- Um caminho único para dano evita que alguma fonte nova de dano "esqueça" de matar
- Mortes resolvidas depois dos laços: remover jogador de dentro de um `forEach` sobre os próprios jogadores é pedir bug
- `CONSENTED` (4000) é obrigatório: fechando sem código, o SDK entende queda de rede e tenta reconectar o personagem morto. Foi encontrado em teste
- Recarregar a página é o jeito mais simples e seguro de zerar o cliente. Quando houver cidade (passo 9), o botão leva para lá

---

## 2026-10 — Desconexão: o personagem fica no mundo, sem prazo; volta por token guardado na aba

**Decisão (dono do projeto):** se a conexão cai, o personagem fica parado onde estava, vulnerável a mobs e a outros jogadores, e a fome continua (regra 6). O jogador pode voltar ao mesmo personagem. A volta funciona ao recarregar a página e em quedas de rede, não ao fechar a aba.

**Como:**
- Servidor: `onDrop` chama `allowReconnection(client, "manual")`, sem prazo. Se o personagem morre enquanto está fora, `resolveDeaths` cancela essa espera, e a tentativa de voltar é recusada
- Cliente: o token de reconexão fica no `sessionStorage` (por aba) e é atualizado a cada reconexão, porque o Colyseus o troca. Ao abrir, se há token, tenta `client.reconnect`; se falhar, mostra "Seu personagem se foi" em vez de criar outro calado. Ao morrer, o token é apagado

**Por quê:**
- Extraction game: sair não pode ser rota de fuga. Fechar o jogo para não morrer deixa o corpo exposto
- Sem prazo de espera não prende a sala para sempre: sem comer, a fome mata o personagem em poucos minutos, e a morte encerra a espera
- Token por aba (escolha do dono do projeto): duas abas no mesmo navegador continuam sendo dois jogadores, como nos testes. O custo é que fechar a aba perde o personagem

**Reavaliar quando:** houver contas ou login. Aí o vínculo jogador-personagem passa a ser a conta, não a aba.

---

## 2026-10 — Inventário: slots com pilhas, verdade no servidor, privado

**Decisão (dono do projeto):** `INVENTORY_SLOTS` (12) slots. Cada slot guarda um tipo de item, empilhando até `maxStack` do item (`ITEMS` no `balance.ts`). Comida ocupa slot como qualquer item.

**Como:**
- A verdade é um vetor simples (`Inventory` em `shared/src/inventory.ts`) guardado num `Map` no servidor. As regras (`addItems`, `removeItems`, `eat`) são funções puras
- `PlayerState.inventory` só espelha esse vetor para o dono ver, com `.view(OWNER_TAG)` como a fome: os outros não sabem o que você carrega
- O cliente só manda pedidos ("eat"; no 6b, "pegar"). O servidor decide

**Por quê:**
- Slots com pilhas tornam a tensão "comida vs. loot" (GDD) visível de cara: cada ração é espaço que não vai para loot
- Inventário alheio escondido: ver o que o outro leva é informação que o jogo pode querer dar como mecânica, mas não de graça

---

## 2026-10 — Comida: o jogador escolhe o slot e come quando quiser; ração inicial provisória

**Decisão (dono do projeto):** cada slot tem uma tecla (1–9, 0, - e =; são 12 slots e só 10 teclas de número). Apertar a tecla do slot onde está a ração come uma, **a qualquer momento, com qualquer fome**: o que passar de `HUNGER_MAX` se perde. O cliente manda `{ slot }`; o servidor valida o índice (`parseSlotIndex`) e aplica o efeito do que está nele (`useSlot`). Todo personagem entra com `STARTING_ITEMS` (3 rações).

**Por quê:** comer é decisão do jogador, inclusive "comer cheio antes de uma luta". Escolher o slot (e não "comer a primeira comida") prepara o terreno para itens diferentes usados pela mesma tecla.

**Histórico:** a primeira versão usava **E** e só comia se a ração coubesse inteira, para não desperdiçar. Foi trocada a pedido do dono do projeto.

**Provisório:** a ração inicial existe porque ainda não há loja. Quando houver (passo 9), a comida passa a ser comprada, e a escolha de quanto levar vira de fato a decisão de preparação do GDD.

---

## 2026-10 — Loot: só de mobs, pilhas no chão com conteúdo escondido; morto larga tudo

**Decisão (dono do projeto):**
- Mob morto deixa uma pilha com o que sortear em `MOB_DROPS` (cada linha: chance e faixa de quantidade). Goblins às vezes largam ração: fonte de comida dentro do labirinto
- Jogador morto deixa o inventário inteiro numa pilha no lugar da morte, para quem pegar: aliado ou, com fogo amigo, qualquer um. Vale também para quem morre desconectado
- **F** pega da pilha mais próxima (até `PICKUP_RADIUS`) o que couber no inventário; o resto fica no chão

**Como:** o conteúdo das pilhas fica num `Map` no servidor. O estado sincronizado (`LootState`) tem só a posição e passa pelo mesmo filtro de visão de mobs e jogadores. Regras puras em `shared/src/loot.ts` (`rollDrops`, `inventoryToPile`, `takeFromPile`, `nearestWithin`).

**Por quê:**
- Conteúdo escondido: quem passa não sabe o que tem na pilha sem ir até ela, o que é exposição a risco, coerente com o GDD
- Morto larga tudo: morrer custa, mas o grupo pode decidir se vale arriscar buscar o corpo

**Consequência descoberta em teste:** uma run dura enquanto houver alguém na sala. Quando a sala esvazia, o Colyseus a encerra, e as pilhas vão junto. Hoje isso é o comportamento desejado; quando houver persistência, decidir se algo do andar sobrevive.

**Regra de estilo aplicada:** com as pilhas, o código de sincronizar desenhos no cliente chegou ao terceiro uso (jogadores, mobs, pilhas) e virou a função `syncSprites`, como manda o `CLAUDE.md`.

---

## 2026-10 — Extração: portais sorteados por run, 5 s parado dentro

**Decisão (dono do projeto):** os pontos da camada `exits` do Tiled são candidatos; em cada run (sala), `EXITS_ACTIVE` deles são sorteados como ativos. Ficar com o centro dentro do raio do portal (`EXIT_RADIUS`) por `EXTRACT_MS` (5 s) extrai. Sair do portal zera a contagem; levar dano não. Ao extrair, o jogador sai da sala levando tudo, e vê "Você extraiu" com a lista. Ninguém deixa pilha ao extrair.

**Como:**
- Regras puras em `shared/src/extraction.ts` (`pickActiveExits`, `isInsideExit`, `stepExtraction`)
- Portais ativos são entidades com posição (`ExitState`), filtradas pelo raio de visão como mobs e pilhas: não se sabe onde está a saída da run sem explorar
- A contagem de cada jogador é privada (`extractMs` com `OWNER_TAG`)
- Só conta para quem está conectado: um corpo largado num portal (desconexão, passo 5c) não extrai sozinho

**Por quê:**
- Portais sorteados entre candidatos: é o "portal de saída em posição variável entre locais possíveis" do GDD. Quem desenha o mapa escolhe os lugares; a run escolhe quais valem
- Ficar 5 s parado cria o momento tenso de segurar posição com mob vindo, e é decisão, não reflexo
- Dano não interrompe, coerente com o golpe de mob não interrompível

**Em aberto:** para onde vão os itens extraídos. Hoje somem depois da tela; o baú (passo 9) é que guarda. Também em aberto: portal de **descida** para o próximo andar (o GDD fala em "saída/descida"); hoje todo portal é saída.

---

## 2026-10 — MUDANÇA: essência é consumida em qualquer lugar; só tirar exige NPC

**Contraria duas decisões anteriores**, por escolha do dono do projeto:
- "Status por essência, não por nível" dizia que a essência "precisa ser extraída" para valer
- "Troca de essência só na cidade, via igreja" restringia toda a troca à cidade

**Nova decisão:** a essência pode ser consumida a qualquer momento, dentro ou fora do labirinto, e ao ser consumida ocupa um slot. **Tirar** uma essência do personagem continua restrito: só com um NPC (a purificação da igreja, mais à frente).

**O que continua valendo:** slots limitados pelo nível e purificação cara para liberar slot. E, pelo GDD, o personagem que morre perde as essências equipadas, então consumir dentro do labirinto é ficar forte agora, arriscando perder tudo.

**Pendente:** o GDD ainda diz "precisam ser extraídas para valer" na seção de Essências; atualizar o texto é decisão do dono do projeto.

---

## 2026-10 — Persistência em SQLite (better-sqlite3), com migrações numeradas

**Decisão (dono do projeto):** o servidor guarda linhagens, personagens e o crédito extraído num arquivo SQLite, via `better-sqlite3` (`server/src/db.ts`). O arquivo padrão é `data/rpg-extracao.db`, fora do git; `DB_FILE` aponta para outro (os testes usam um banco descartável e nunca tocam no do dono do projeto).

**Como:** mudanças de esquema são migrações numeradas, aplicadas em ordem, com a última aplicada guardada em `PRAGMA user_version`. Nunca se edita uma migração já publicada; acrescenta-se outra. A regra "uma linhagem tem no máximo um personagem vivo" é garantida também por um índice único no banco, não só pelo código.

**Por quê:** SQLite sobrevive a reiniciar o servidor, aguenta escritas de vários jogadores e escala até baú, cidade e linhagem completa. A alternativa embutida (`node:sqlite`) foi descartada pelo dono do projeto em favor da biblioteca madura.

---

## 2026-10 — Identidade por nome; personagem e linhagem entre runs

**Decisões (dono do projeto):**
- **Identidade = nome digitado ao entrar**, sem senha. Maiúsculas e minúsculas não importam. Validado na entrada (`parsePlayerName`): 2 a 20 caracteres, letras, números, espaço, - e _
- **Linhagem** = o nome. Guarda o crédito extraído e, no 7b, o bestiário (sobrevive à morte)
- **Personagem**: um vivo por linhagem. Sobrevive à extração. Morreu, a próxima entrada com o nome cria um herdeiro
- **XP é por personagem** (7b): o herdeiro reganha nível matando de novo cada tipo; o bestiário (conhecimento) é que é da linhagem
- ~~**Entre runs, o inventário zera.** O que foi extraído vira crédito da linhagem, sem uso até baú e loja~~ (substituído: ver "Inventário vai com o personagem")
- **Um personagem não entra duas vezes ao mesmo tempo:** o `onAuth` recusa o nome de quem já está numa sala (incluindo desconectado esperando voltar)

**Por quê:** jogo entre amigos; login com senha seria muito código para o problema de agora. O risco aceito é que qualquer um que digitar o seu nome entra como você.

**Reavaliar quando:** o jogo sair do círculo de amigos.

---

## 2026-10 — Bestiário da linhagem, XP do personagem, crédito ao golpe final

**Decisão:**
- **Bestiário** (tabela `bestiary`): tipos de mob que alguém da linhagem já matou. Sobrevive à morte
- **XP** (coluna `characters.xp` e tabela `character_kills`): a primeira morte de cada tipo **por personagem** dá `FIRST_KILL_XP`. O herdeiro reganha XP matando de novo cada tipo (escolha do dono do projeto)
- **Nível** sai do XP pela tabela `LEVEL_XP` (`levelForXp` em `shared/src/progression.ts`). Nível = número de slots de essência (7c)
- **Crédito:** quem dá o golpe final leva a primeira morte
- **Aviso:** o servidor manda `firstKill` dizendo se o nível subiu. O cliente não compara com o estado, porque mensagem e patch de estado podem chegar em qualquer ordem

**Por quê (crédito ao golpe final):** é o mais simples e sem ambiguidade. O custo é que, no co-op, o grupo precisa combinar quem finaliza cada tipo novo. Dividir o crédito entre quem participou fica para quando incomodar.

**Valores iniciais:** 1 de XP por tipo novo; níveis 2 a 7 pedem 1, 2, 4, 7, 11 e 16 de XP no total. Com 2 tipos de mob, o máximo hoje é nível 3.

---

## 2026-10 — Essências: efeitos de status somados, aplicados pelo servidor, equipadas no banco

**Decisão:**
- Três essências placeholder (proposta aprovada pelo dono do projeto), como itens em `ITEMS` com um campo `essence`: rato +15% de velocidade; goblin +4 de dano; goblin rara +25 de vida máxima. Caem dos mobs por `MOB_DROPS` (rato 15%; goblin 20%; rara 5%)
- Consumir pela tecla do slot (`useSlot`, mesmo caminho da comida) ocupa um slot de essência se houver livre (slots = nível); senão é recusado com aviso e nada é gasto
- Efeitos iguais se somam (porcentagens somam, não multiplicam). `playerStats` em `shared/src/essences.ts` calcula velocidade, dano e vida máxima; o servidor aplica no movimento, no golpe (contra mob e contra jogador) e na vida
- Consumir a de vida aumenta a vida máxima e a atual na mesma quantidade
- Equipadas ficam no personagem, no banco (migração 3). Sobrevivem à extração; somem com a morte. Essências não consumidas, no inventário, viram crédito ao extrair, como qualquer item (hoje: ficam no inventário do personagem)

**Por quê:** um único caminho de "usar o slot" para comida e essência; a regra de recusa vive numa função pura testável; o cliente não calcula nada disso (regra 1), só mostra.

**Em aberto:** habilidades únicas e afinidade de área (GDD) entram quando houver escuridão e mais mobs; tirar essência vem com o NPC de purificação.

---

## 2026-10 — Cidade: sala própria, uma para todos, segura; portal com tecla E

**Decisão (dono do projeto):** a cidade é uma sala Colyseus própria (`city`, `server/src/CityRoom.ts`) com o mapa `assets/maps/city.json`. Existe **uma cidade para todos** os jogadores conectados. Nela não há combate, fome nem mobs (o GDD diz que cidades são seguras). O portal para o labirinto é um ponto na camada `portal` do mapa; apertar **E** com o centro dentro do raio (`CITY_PORTAL_RADIUS`) tira o jogador da cidade, e o cliente entra numa run **aberta com vaga** do labirinto (`joinOrCreate("game")`, como antes).

**Fluxo:** nome → cidade → E no portal → labirinto → extraiu ou morreu → cidade (o morto volta como herdeiro, como já era).

**Como:**
- O controle de "personagem já está dentro" saiu do `GameRoom` para `server/src/presence.ts`, comum às duas salas: ninguém fica na cidade e no labirinto ao mesmo tempo. O servidor libera o personagem **antes** de mandar a mensagem de saída, para a entrada na próxima sala não ser recusada
- A cidade não tem `onDrop`: quem cai sai, e volta pelo nome. Não há corpo exposto num lugar seguro
- No cliente, cada visita a um lugar é uma cena nova do Phaser (a anterior é removida inteira). O nome fica guardado por aba (`sessionStorage`), e as viagens entram com ele sem perguntar de novo
- O portal da cidade é desenhado a partir do mapa, como as paredes (é fixo). A dica "E: entrar" é só visual; quem confere é o servidor
- Interest management continua valendo na cidade (regra 5), mesmo sendo pequena

**Por quê:**
- Sala própria: "cidade = sala" já estava na decisão do Colyseus; a cidade não carrega nada da simulação do labirinto
- Tecla em vez de ficar parado: entrar no labirinto é uma escolha deliberada; passar perto do portal não deve levar ninguém por engano
- Cena nova por lugar: zerar campo por campo de uma cena reaproveitada é fonte de bug (desenhos e teclas de um lugar vazando no outro)

**Limites conhecidos:**
- Como a identidade é só o nome, dá para entrar direto no labirinto sem passar pela cidade. Hoje a cidade não tem nada a preparar; quando houver loja, amarrar a entrada do labirinto à saída pela cidade
- Os 3 prédios da cidade são só paredes, à espera de loja, hotel e igreja

---

## 2026-10 — MUDANÇA: inventário vai com o personagem; fim do crédito da linhagem

**Contraria** a decisão "Identidade por nome; personagem e linhagem entre runs", que dizia: entre runs o inventário zera e o extraído vira crédito da linhagem. Aquilo era provisório porque não havia para onde voltar; com a cidade, há. Escolha do dono do projeto.

**Nova decisão:**
- O inventário é do **personagem** (coluna `characters.inventory`, migração 4). Extraiu: chega à cidade com tudo. Entra no labirinto com o que tem
- **Kit inicial uma vez só:** personagem novo (o primeiro da linhagem ou um herdeiro) recebe `STARTING_ITEMS`; depois disso, comida só vem dos goblins, até existir loja. No banco, `inventory` NULL quer dizer "nunca gravado" e vira o kit (`restoreInventory` em `shared/src/inventory.ts`)
- **Na cidade, as teclas de slot funcionam como no labirinto:** dá para consumir essência e também comer, mas comer lá gasta a ração sem efeito (não há fome na cidade)
- **O crédito da linhagem foi apagado** (`DROP TABLE lineage_credit` na migração 4), com o que já tinha nele
- Morte não muda: o inventário cai no chão e o personagem morto o leva

**Quando o banco é gravado:**
- No labirinto, **só na extração.** Se o servidor cair no meio de uma run, ela "não aconteceu": o loot pego se perde e a comida comida volta. Ninguém lucra com queda de servidor (escolha do dono do projeto)
- Na cidade, **na hora**, a cada item usado: não existe run para desfazer

**Limite conhecido:** sair do labirinto com saída intencional (`leave` com código de consentimento, que o cliente oficial nunca usa) tira o personagem da sala sem morte nem extração, e ele volta com o inventário de antes da run. Um cliente modificado escaparia de uma luta perdida assim. Já existia antes desta mudança (o personagem sobrevivia), mas agora o inventário torna isso mais valioso.

---

## 2026-10 — Arte real na cidade (LPC), gerada por script; labirinto segue com placeholder

**Contraria** a decisão "Arte: placeholders primeiro" só para a cidade. A fatia mínima jogável já existia e o dono do projeto pediu a cidade com arte.

**Decisão:**
- A cidade usa pacotes **LPC** (Liberated Pixel Cup) escolhidos pelo dono do projeto: terrenos, prédios e decoração vitorianos, decoração medieval. Todos seguem o mesmo guia de estilo do LPC, então misturar os pacotes não deixa o visual "remendado" (preocupação da decisão de placeholders)
- Estilo e estrutura inspirados na ilustração da capital do manhwa (muralha, avenida, praça redonda, palácio ao fundo), sem nomes nem arte da obra (decisão "tom, não conteúdo")
- O mapa é **gerado por script** (`tools/city/`), não desenhado à mão: deixa o layout reproduzível e fácil de mudar em bloco. Ajustes finos podem ser feitos no Tiled depois, sabendo que gerar de novo sobrescreve
- Colisão continua pela propriedade `solid` de cada tile (decisão anterior); o gerador marca `solid` em todo tile de prédio, muralha e objeto
- **Créditos obrigatórios:** as licenças (CC-BY-SA na maioria) exigem atribuição; ficam em `assets/tilesets/CREDITS.md`. Modificações dessa arte precisam sair sob a mesma licença

**Mudanças no cliente que vieram junto:**
- Tilesets: o nome do tileset no mapa é o nome do arquivo em `assets/tilesets/`, e o cliente carrega todas as PNGs da pasta. Serve para qualquer mapa sem regra por lugar
- Camadas `above*` são desenhadas por cima do jogador; é o que faz passar "atrás" de poste, árvore e toldo. Só visual: a colisão continua vindo do servidor
- `VITE_SERVER_PORT` aponta o cliente para outro servidor (testes em porta própria sem tocar no servidor e no banco do dono do projeto)

**Custo aceito:** as folhas LPC são grandes (a de janelas e portas tem 1024x5120). São 8 imagens, cerca de 2 MB no total, carregadas uma vez.

---

## 2026-10 — Tela inteira com a mesma distância de visão para todos

**Decisão:** o jogo ocupa a janela inteira do navegador, em qualquer formato. O tamanho do jogo em pixels do mundo segue o formato da janela, mas sempre com **meia-diagonal de 500 px** (`SCREEN_HALF_DIAGONAL`, `viewportSize` em `shared/src/visibility.ts`); o Phaser amplia a imagem (modo FIT) para preencher. Janela 4:3 continua mostrando 800x600; janela larga mostra mais dos lados e menos em cima e embaixo.

**Por quê:**
- Aumentar a tela sem fixar a área visível faria monitor grande ver mais longe: vantagem para quem tem tela maior, e mobs surgindo do nada dentro da tela, porque o servidor só envia até `VIEW_RADIUS` (520). Com a meia-diagonal fixa abaixo do raio, a regra "nada surge do nada dentro da tela" (decisão de interest management) continua valendo em qualquer janela
- Zoom de câmera foi descartado: no Phaser ele também amplia o HUD fixo, o que exigiria uma segunda câmera ou cena só para o HUD

**Detalhe:** ao redimensionar, o cliente espera um quadro e mede o `#app` de novo antes de mudar o tamanho; no próprio evento o layout novo ainda não terminou e o jogo ficava com tarja preta.

---

## 2026-10 — Cidade com a arte nova (dark fantasy): objetos com Y-sorting e colisão na base

**Substitui** a cidade LPC (decisão "Arte real na cidade (LPC)"), a pedido do dono do projeto, que trouxe arte própria (`assets/tilesets/novos tilesets/`): 10 casas, chão, enfeites e portal.

**Contraria em parte** a decisão "Top-down, não isométrico": as casas e a maioria dos enfeites são desenhados em perspectiva **isométrica** (quina virada para a tela). O jogo continua top-down (movimento, colisão, câmera, chão); só a arte desses objetos é isométrica. Escolha consciente do dono do projeto, avisado de que as casas ficam "giradas" em relação às ruas e de que a colisão perto das quinas do losango é aproximada.

**Como:**
- **Processamento em Python** (`tools/assets/`, Pillow + NumPy num ambiente local): tira o fundo (quadriculado "falso" das imagens geradas e buracos brancos presos na arte), recorta e reduz por **média de área** (não Nearest: a arte é pintada em alta resolução, e reduzir 8x com Nearest vira ruído)
- **Chão** continua tile de 32 px. As peças de guia que faltam (espelhadas e o canto de quarteirão) são geradas; vinheta tirada e variantes igualadas para o chão não parecer um xadrez
- **Casas, enfeites e portal são objetos** de uma coleção de imagens do Tiled. A colisão de cada um é um retângulo na base, desenhado no próprio tile (o jeito do Tiled: segue o objeto se ele for movido). O servidor lê esses retângulos (`parseObjectFootprints`) e marca como parede as células cujo centro cai dentro; base menor que uma célula (poste) bloqueia a célula onde fica. A colisão continua sendo a grade de 32 px de sempre
- **Y-sorting no cliente**: jogadores, mobs, casas e enfeites ficam com profundidade = y da base. Quem está mais embaixo na tela é desenhado na frente: dá para passar atrás do telhado e na frente da porta. Só visual

**Limites aceitos:** colisão em células de 32 px (bordas da colisão não seguem o losango da casa); objetos isométricos ao lado de ruas retas.

---

## 2026-10 — Ficha de registro (nome e classe) em HTML; classe guardada pelo servidor

**Decisão (dono do projeto):** ao entrar, o jogador passa por uma "ficha de registro de aventureiro" com a arte do pacote Paper UI recolorida para dark fantasy: tela do nome e, **só para personagem novo** (primeiro da linhagem ou herdeiro), tela de classe com as 4 classes (mago, elfo, bárbaro, homem fera), carimbo e fade para a cidade. Quem volta com um personagem vivo que já tem classe vai direto para a cidade.

**Contraria dois pontos do pedido original, de propósito:**
- O pedido falava em guardar classe e atributos no `localStorage`. Isso contraria a **regra 1** (o cliente não decide nada que importa): a classe fica **no personagem, no banco** (migração 5), escolhida uma vez e sem troca. O servidor recusa a entrada de personagem sem classe com `CLASS_REQUIRED_CODE` (428); o cliente então mostra a ficha e entra de novo mandando a classe (`admit` em `server/src/presence.ts`)
- O nome passou de 2–20 para **2–16** caracteres (pedido do dono do projeto), mudando a decisão "Identidade por nome". Nenhuma linhagem existente tinha nome maior que 16

**Por quê HTML e não Phaser:** as peças do pacote são grandes (caixa de diálogo de 688 px, ficha de 448 px de altura) e não cabem na área do mundo (~870x490 numa tela larga). Em HTML a ficha tem layout fixo de 1280x720 ampliado por **fator inteiro** com `image-rendering: pixelated` (nítida em qualquer tela), e o campo de nome é um input de verdade.

**Por enquanto a classe só fica registrada (escolha do dono do projeto):** não muda vida, dano nem velocidade. As barras da ficha são descritivas. Fúria, Mana, Instinto Bestial e os números de cada classe entram no passo 10, no `balance.ts`.

**No jogo:** o jogador é desenhado com o sprite da classe (64x64, 8 direções), virado para onde andou (só visual) e com o nome em cima; `name` e `classId` são públicos no estado (os outros jogadores veem).

**Licença do Paper UI:** uso e modificação em jogos liberados; redistribuição do pacote (mesmo modificado) proibida. O repositório não tem remoto hoje; se um dia for publicado, `assets/tilesets/interface/` e `assets/ui/` precisam ficar de fora.

---

## 2026-10 — 1º andar do labirinto: Caverna de Cristal, gerada por script

**Decisão (dono do projeto):** o labirinto deixa o mapa de teste (`test.json`) e passa a ser a Caverna de Cristal (`assets/maps/dungeon_floor1.json`, 128x96 tiles), com a arte nova de `assets/tilesets/labirinto/`. Cinco regiões: centro (chegada), norte (acampamento goblin), leste (covil dos lobos), oeste (minas dos gnomos) e sul (fosso dos slimes).

**Escolhas do dono do projeto:**
- O portal do centro é **só a chegada** (decorativo). As saídas continuam sorteadas entre candidatas (8, duas por região de fora; `EXITS_ACTIVE` = 2); a saída ativa é desenhada com a arte do portal, puxada para o azul.
- Quarto mob: **slime**.
- O **rato sai** do 1º andar e a essência de velocidade (+15%) passa para o **lobo** (`essencia_lobo`). `pele_de_rato` e `essencia_rato` continuam em `ITEMS`: há personagens com eles.
- Gnomo e slime ainda sem essência, só material (`fragmento_de_cristal`, `gosma_de_slime`); o gnomo às vezes carrega ração.

**Como:**
- Mapa gerado por `tools/assets/build_labyrinth.py`, como a cidade: salas de borda irregular e túneis que serpenteiam, suavizados. Um túnel sai do centro para cada região, e dois anéis (um por dentro, outro por fora) ligam regiões vizinhas: sempre há outro caminho para fugir.
- Paredes: tiles gerados por combinação de vizinhas. Topo da rocha escuro, beirada clara onde encosta no chão e, na parede que tem chão embaixo, uma face de pedra (fatias da arte do paredão) que dá altura à caverna. O chão encostado na parede ganha sombra.
- Enfeites são objetos com retângulo de colisão na base (mesma regra da cidade). Um enfeite sólido só entra se não isolar nenhum pedaço da caverna; os paredões encostados nas paredes só entram onde a base já é rocha (não mudam a colisão).
- Áreas do servidor: cinco nomes, em retângulos que cobrem o mapa inteiro.
- Luz: cristais, tochas, minério, cogumelos e portais têm uma mancha de luz somada ao chão no cliente. **Não contraria a regra 4:** é só desenho e não esconde nem revela nada; a escuridão de verdade (raio de replicação) continua pendente.

**Números dos mobs novos são iniciais** (`MOB_KINDS`): lobo rápido e frágil, gnomo com golpe largo, slime lento e resistente com golpe quase em volta.

---

## 2026-10 — Sprites e animação: só visual, direção deduzida do movimento

**Como:** personagens (das classes) e inimigos são desenhados com sprites de 64x64 em 8 direções, em 1:1 (arte de pixel nítida com `pixelArt`), com os pés na base da caixa de colisão e profundidade pelo y dos pés (Y-sorting).
- A **direção** não vem do servidor: o cliente olha para onde a entidade andou desde o último quadro. Inimigo preparando golpe olha para onde vai bater (`attackAngle`, que o servidor já mandava para o aviso no chão)
- **Andando** = a posição mudou nos últimos 150 ms (o servidor manda 20x/s e a tela desenha 60x/s; sem essa folga a animação piscaria). Personagens têm caminhada (fitas geradas dos GIFs de `walk/`); inimigos por enquanto só têm a pose parada
- Os sprites dos inimigos são lidos direto de `assets/tilesets/Inimigos/<Tipo>/Idle/rotations/`: o nome da pasta é o tipo do mob. As cores por tipo (quadrados) saíram

**Por quê:** é informação só de desenho; mandar direção pelo servidor gastaria rede sem mudar nenhuma regra (regra 1 continua: o cliente não decide nada que importa).

**Limite aceito:** em 1:1, gnomo e goblin ficam quase da altura do jogador. Reduzir arte de pixel por fator não inteiro a deixa borrada ou com pixels irregulares; se incomodar, o caminho é arte no tamanho certo.

---

## 2026-10 — Arte original fora do git; sobras da cidade LPC apagadas

**Decisão (dono do projeto):**
- As imagens originais grandes (`assets/tilesets/novos tilesets/`, ~35 MB; `labirinto/`, ~10 MB; o pacote Paper UI em `interface/`, ~12 MB) ficam **fora do git** (`.gitignore`). O jogo só usa o que os scripts de `tools/assets/` geram a partir delas, e isso vai para o git. Para gerar de novo, as originais precisam estar no disco: o dono do projeto guarda uma cópia
- A cidade LPC (decisão "Arte real na cidade (LPC)") já tinha sido substituída pela arte nova; as sobras foram **apagadas** (PNGs LPC, `CREDITS.md`, `tools/city/`), junto com o mapa de teste antigo (`test.json` e `placeholder.png`). Sem arte LPC no jogo, a obrigação de créditos dessa licença deixa de existir
- O pacote Paper UI fora do git também resolve metade do problema de licença (não redistribuir). As peças recoloridas em `assets/ui/` continuam no git; o repositório não tem remoto, mas se um dia for público, elas precisam sair

**Por quê:** histórico do git é para sempre; 57 MB de originais que o jogo não usa deixariam cada clone pesado. E o cliente carrega todas as PNGs de `assets/tilesets/`: as sobras LPC eram baixadas à toa ao abrir o jogo.

---

## 2026-10 — Escuridão de verdade no labirinto; luz desenhada (polimento visual, etapa 1)

**Pedido do dono do projeto:** iluminação dinâmica (cidade ao entardecer, caverna escura com luz do jogador, cristais, tochas e portais), vinheta e sombras nos pés. A especificação pedia uma máscara escura (0,82) só desenhada; isso contrariaria a **regra 4**: o servidor mandava tudo até 520 px, e quem tirasse a máscara no navegador veria tudo. **Escolha do dono do projeto: escuridão de verdade.**

**Como (servidor, regra 4):**
- No labirinto, mobs e pilhas só são enviados a um jogador se estiverem **iluminados**: a até `PLAYER_LIGHT_RADIUS` (240 px) de algum jogador, num tile de luz fixa (luzes do mapa) ou perto de uma saída ativa (`EXIT_LIGHT_RADIUS`). Jogadores e saídas brilham: continuam vistos até `VIEW_RADIUS`
- A luz fixa vira uma grade por tile, calculada uma vez por run (`staticLitMap`); consultar é olhar a célula. Funções puras em `shared/src/light.ts`, com testes
- As luzes ficam numa camada de pontos `luzes` nos mapas, com o tipo no nome; o raio de cada tipo fica em `LIGHT_RADIUS` (`balance.ts`), porque decide o que se vê. Os scripts de `tools/assets/` geram a camada (janelas acesas e lanternas são achadas na arte pelos pixels quentes); dá para editar no Tiled
- Resultado no 1º andar: centro 73% iluminado, acampamento 58%, minas 60%, fosso 47%, covil dos lobos 0% (lobos só aparecem na luz de quem chega)

**Como (cliente, só desenho):** uma camada do tamanho da tela, por cima do mundo e por baixo de barras, nomes e HUD, começa com a cor do ambiente e recebe cada luz somada; depois multiplica o mundo (`client/src/lighting.ts`). Os raios desenhados são os mesmos do servidor e nunca passam deles (o tremor da chama só encolhe): a escuridão cobre só o mapa, que é público. Vinheta na mesma faixa de profundidade (não escurece o HUD). Sombras: elipse no chão sob jogadores, mobs e enfeites em pé, pulsando com o passo. Os brilhos aditivos do chão da etapa anterior saíram (a luz de verdade os substitui).

**Limites aceitos:** a luz atravessa paredes (círculo simples, sem sombra projetada), igual no servidor e no desenho; lobos notam o jogador a 256 px, um pouco antes de entrar na luz dele (240), e aparecem já vindo.

**Também decidido:** sem golpe crítico por enquanto (não existe a regra); recuo ao levar golpe só visual. Etapas 2 (flash, números, tremor, golpes por classe) e 3 (partículas) a seguir.

---

## 2026-10 — Impacto (polimento visual, etapa 2): tudo deduzido no cliente, nada novo no servidor

**Como:** o cliente compara a vida de cada jogador e mob com a do quadro anterior. Caiu: número de dano, flash e recuo; subiu (só em você): número verde. Golpe novo (`attackSeq`) desenha o rastro da classe de quem bateu; primeira morte mostra "+XP". Código em `client/src/juice.ts`.

**Por quê assim:** são só efeitos (regra 1): o servidor já mandava tudo o que precisa (vida, golpes). Mandar eventos de dano novos só serviria para casos raros (dois golpes no mesmo pacote viram um número só, somado).

**Detalhes decididos:**
- Recuo só visual (escolha do dono do projeto): o sprite dá um tranco de 4 px e volta; a posição de verdade não muda
- Sem golpe crítico (escolha do dono do projeto): não há regra de crítico; o número dourado entra quando houver
- Tremor: quando você leva golpe de 12 ou mais (goblin, slime, gnomo; o lobo não treme) e, leve, quando o golpe do bárbaro acerta (a classe "pesada"; não há habilidades ainda, passo 10)
- Rastros de golpe por classe são enfeite por cima da área de acerto de verdade, que continua desenhada: a arma é a mesma para todos até o passo 8
- O servidor tira o mob morto no mesmo tick do golpe final, então o cliente nunca vê a vida chegar a 0: se o mob some logo depois de um golpe que o alcançava, o número mostrado é a vida que restava

---

## 2026-10 — Partículas (polimento visual, etapa 3): sistema próprio, pequeno

**Como:** `client/src/particles.ts` cuida de três movimentos: gotas (saltam do mob atingido para longe de quem bateu e caem com gravidade), esporos (sobem devagar oscilando, acendem e apagam) e espiral (dá voltas subindo em volta do portal). Cada partícula é um quadradinho de 1 pixel de textura (feito no código) ampliado, nítido como o resto da arte. No máximo 400 vivas; só luzes na tela soltam partículas, numa taxa por segundo por tipo de luz (`SPORE_RATE`, `SPIRAL_RATE` em `main.ts`).

**Por quê não o emissor do Phaser:** cada tipo tem um movimento próprio (a espiral precisa de ângulo e raio por partícula), e escrever os três à mão ficou mais curto e legível do que configurar o emissor para cada caso. Se um dia o número de partículas pesar, trocar por emissores é uma mudança só dentro deste arquivo.

**Só desenho:** nada disso vem do servidor nem muda o jogo. Esporos e faíscas ficam entre a camada de luz e a vinheta, somando cor: brilham no escuro, como os cristais.

---

## 2026-10 — HUD oficial em HTML, medido na própria arte

**Pedido do dono do projeto:** trocar o HUD provisório pela arte dark fantasy dos kits `hud_status_kit.png` e `hud_inventario_kit.png`.

**Escolhas do dono do projeto:**
- **HTML, como a ficha de registro**, e não Phaser: a arte é ampliada por um fator inteiro (1 em 1366x768, 2 em 1920x1080...), com pixels nítidos; o canvas do jogo é ampliado por fator quebrado, o que deforma arte fina. De graça: fica livre da luz e do tremor da câmera, e cliques e textos são do navegador
- **Mochila agora** (I ou Tab): a barra nova só tem 6 slots; sem a janela, os slots 7 a 12 ficariam invisíveis. Os 6 slots de equipamento aparecem desativados (não há equipamento no jogo)
- **Ícones desenhados no código** (`process_hud.py`): os kits não têm ícones de itens; quando houver uma folha de ícones na arte do jogo, ela substitui estes

**Como:**
- O script mede na arte onde ficam os vãos (retrato, calhas, slots da barra, couro da mochila) e grava em `assets/ui/hud/layout.json`: o cliente não tem coordenada escrita à mão, e trocar a arte é rodar o script de novo
- O HUD só desenha: `main.ts` entrega os dados do próprio jogador a cada quadro; clicar num slot manda o mesmo `use` da tecla (regra 1). O HUD só mexe na página quando um valor muda
- **Raridade** virou campo de cada item em `ITEMS` (comum: comida e materiais; rara: essências; épica: essência rara). Por enquanto só escolhe a moldura do slot
- Na cidade não há vida nem fome: as barras aparecem cheias (é assim que se entra na caverna); a vida máxima sai das essências (`playerStats`)
- A barra azul (recurso de classe) fica cheia só de enfeite até o passo 10, como no pedido

**Descartado:** `orelha_de_goblin` do pedido não existe; o item do goblin é `dente_de_goblin`.

---

## 2026-10 — Janela de inventário e regra visual de raridade

**Como:** a mochila simples virou a janela de inventário (`client/src/inventoryWindow.ts`), aberta com I, Tab ou B (Esc fecha). É uma camada HTML: não segura o teclado do jogo, então WASD e as teclas de slot continuam valendo com ela aberta. Três seções no couro do painel: equipamento em volta do personagem com o resumo de atributos, altar das essências, mochila (12 slots, 2 fileiras de 6). Clicar num item manda o mesmo `use` da tecla (regra 1).

**Regra visual de raridade** (campo `rarity` em `ITEMS`; por enquanto só muda a moldura e a cor do nome na dica):
- Comum: comida e materiais de monstro (ração, peles, dente de goblin, gosma de slime)
- Raro: fragmento de cristal e as essências comuns (rato, lobo, goblin)
- Épico: essência rara de goblin
- Lendário: nenhum item ainda
Slot vazio usa a moldura comum.

**Atributos e textos sem número escrito à mão:** dano, velocidade e vida máxima na janela saem de `playerStats` (a mesma regra pura que o servidor usa) e da vida máxima que o servidor manda; os textos das dicas saem dos campos do item (`food`, `essence`): item novo já se descreve sozinho.

**Equipamento:** não existe no jogo ainda. O slot da arma mostra a arma inicial (a única até a maestria, passo 8) com dano e alcance; os outros mostram só a silhueta, com a dica "em breve na Cidade".

**Essências:** o altar mostra os slots que o nível abre (nível = slots) e os próximos trancados até o nível máximo, cada um dizendo o nível que o abre. A dica de uma essência absorvida lembra que tirar só por purificação na igreja (decisões "Troca de essência só na cidade, via igreja" e a mudança seguinte).

**Detalhes do pedido adaptados:** `orelha_de_goblin` não existe (é `dente_de_goblin`). A janela é maior que a da etapa anterior (360x518 pixels de HUD) para caber as três seções; em 1920x1080 (escala 2) ela encosta na barra rápida, que fica na frente: atrás dela só a base de ferro do painel.

---

## 2026-10 — Caminhada dos inimigos; gnomo anda em 4 direções

**Como:** igual à caminhada das classes (decisão "Sprites e animação: só visual"). Andando = a posição mudou nos últimos 150 ms **e** o mob não está preparando golpe; toca a fita da direção a 10 FPS. Parado ou preparando golpe: o sprite parado da direção (8 direções; preparando, olha para `attackAngle`). Pivô nos pés nas duas folhas, medido nas imagens: o bicho não pula ao trocar.

**Arte só nas direções que existem:** `tools/assets/process_mobs.py` converte os GIFs de `walk/` em fitas e **não inventa** as que faltam (as classes, em `process_ui.py`, preenchem com espelho ou cópia). O cliente carrega só os arquivos que existem e escolhe na hora:
- Lobo e goblin: as 8 direções
- **Gnomo: só as 4 cardeais.** Andando na diagonal, usa a cardeal do lado para onde vai (nordeste e sudeste: leste; noroeste e sudoeste: oeste). Continua mexendo as pernas e nada pede arquivo inexistente. Quando chegar a arte das diagonais, basta pôr os GIFs e rodar o script: o cliente passa a usá-las sem mudar código
- Slime: sem caminhada; continua com o sprite parado

**Muda a decisão "Sprites e animação":** os sprites dos inimigos deixam de ser lidos direto de `assets/tilesets/Inimigos/`. Agora o script copia o parado e gera a caminhada em `assets/mobs/<tipo>/` (como `assets/characters/` para as classes), e o cliente lê tudo de lá: uma pasta só por bicho, com o que o jogo usa. `Inimigos/` vira só a arte de origem.

---

## 2026-10 — Cidade refeita com arte frontal: fileiras, praça central e marcos

**Substitui** a decisão "Cidade com a arte nova (dark fantasy)" na arte e no traçado, a pedido do dono do projeto, que trouxe 7 folhas novas (`Casas1`, `Casas2`, `Guilda`, `Ferreiro e Mercador`, `EnfenitesRua`, `EnfeitesRua2`, `Tileset`). A técnica continua a mesma: processamento em Python, objetos de uma coleção de imagens, colisão num retângulo na base, Y-sorting. As casas isométricas e os enfeites antigos saíram do jogo (PNGs apagados de `assets/tilesets/city/`).

**Fim da exceção isométrica:** a arte nova é desenhada de frente (fachada virada para baixo da tela), o que combina com "Top-down, não isométrico". A ressalva da decisão anterior (casas "giradas" em relação às ruas, colisão aproximada nas quinas) deixa de valer.

**Como:**
- **Escala pela porta:** casas a 0,46 do tamanho da folha (porta com ~60 px, a altura do jogador). Com 0,50, as 12 casas não cabiam nas 80 colunas sem se sobrepor. Guilda, Forja e Estalagem a 0,32 (saem ~1,5x maiores que uma casa, como marcos). Portal com 100 px de altura
- **Recorte pelo desenho, não pela grade:** cada casa da folha 3x2 é um pedaço conectado da imagem e fica com a célula onde está o centro dele. Recortar pelas linhas da grade levava a placa e o cata-vento da casa vizinha
- **Cidade em fileiras**, porque a arte é frontal: cada prédio tem a base na beira de uma calçada, com a rua logo abaixo; nenhum prédio fica de lado. Norte: casas, Guilda, alameda do Portal, Estalagem e Cofre, casas (parque atrás). Meio: feira de rua, praça nobre com o chafariz, Forja. Rua Principal cortando o mapa. Sul: 7 casas no bairro rústico
- **Chão em dois níveis:** piso nobre (`Tileset.png`: ruas cinza, guias, praça com moldura, caminho de bronze do portal ao chafariz) no centro; o paralelepípedo rústico antigo na periferia. As guias das 4 direções e os cantos são montados com peças da folha (espelhadas ou giradas); os cantos curvos da folha recebem o tile de rua por baixo
- **Luzes:** tipos novos `braseiro`, `forja` e `vela` (raio em `LIGHT_RADIUS`, cor em `LIGHT_LOOKS`). As manchas quentes da arte viram luz só onde faz sentido: janelas em casas e marcos, a maior mancha da Forja vira a fornalha, lanternas nos postes, velas nas mesas da taverna. Barraca ocre e árvore de outono "acenderiam" pela regra de cor e ficam de fora. O chafariz deixou de ter luz própria: a praça é iluminada pelos postes em volta
- **Conferência no gerador:** prédios sobrepostos, prédio cobrindo rua, enfeite sólido no meio da rua e objeto fora do mapa. Postes e braseiros da alameda ficam na beira dela, deixando 4 tiles livres de passagem
- Prédios continuam sem sombra no pé (a base já vem desenhada na arte); os enfeites em pé têm

**Limites aceitos:** os prédios são só fachada (nada funciona dentro); colisão em células de 32 px, como antes.

---

## 2026-10 — Prédios da cidade: moedas e baú da linhagem, negócio só na porta do prédio

**Decisões (dono do projeto):**
- **Moedas são só da linhagem:** uma bolsa só, segura, que o herdeiro herda. Moeda só serve na cidade; levá-la ao labirinto não teria ganho, só risco, e viraria a rotina de sempre depositar antes de entrar. Sem cofre separado. No labirinto, o HUD só mostra o saldo
- **Baú da linhagem na Estalagem, de graça, com 24 slots** (`STASH_SLOTS`). **Contraria o GDD**, que põe o baú persistente na casa (alugar ou comprar). Provisório: quando existir casa, decidir se o baú vai para ela ou se a Estalagem passa a cobrar
- **Forja só como vitrine** até o passo 8 (armas e maestria): catálogo e receitas futuras, tudo "em breve"
- **Em 3 etapas:** 1) base (portas, banco, regras, servidor, moedas na HUD); 2) janelas da Guilda (venda) e da Estalagem (baú e ração); 3) Bestiário, Rank e Forja

**Como:**
- **Portas no mapa:** camada de pontos `interacoes`, com o id do prédio no nome (`BUILDINGS` em `shared/src/city.ts`); um prédio pode ter várias (a Estalagem tem duas). Raio `CITY_INTERACT_RADIUS`. O servidor valida as portas ao subir, como spawns e portal
- **Regra 1:** a janela aberta no cliente não vale nada. Cada pedido (`sell`, `buy`, `deposit`, `withdraw`) é conferido na hora: o jogador precisa estar na porta do prédio certo (vender na Guilda; comprar e baú na Estalagem), o item e a quantidade precisam ser válidos, e as regras puras decidem
- **Tudo ou nada:** vender mais do que se tem, comprar sem moedas para tudo ou sem espaço para tudo é recusado com aviso, sem negócio parcial. Guardar e retirar levam a pilha inteira; o que não cabe fica no slot de origem
- **Gravação:** na hora, como o resto da cidade. A mochila do personagem e as moedas/o baú da linhagem vão juntos numa transação (`saveCityChange`): uma queda no meio não duplica nem some item. O banco é gravado antes da memória
- **Banco:** migração 6, colunas `coins` e `stash` em `lineages` (o baú no mesmo JSON do inventário; NULL = vazio)
- **Preços** em `balance.ts`: `SELL_PRICES` (pele de rato 1, gosma 2, dente de goblin 3, pele de lobo 4, fragmento 8, essências 15, essência rara 40) e `BUY_PRICES` (ração 10). A ração não se vende. Valores iniciais: uma run com uns 5 drops paga mais ou menos 2 rações
- **Testes do banco** em `server/src/db.test.ts` (SQLite em memória ou em pasta temporária): migração e herança são gravação, não regra pura, então não cabem em `shared/`. O `npm test` passou a rodar `shared` e `server`

**Janelas (etapa 2):**
- HTML, como a HUD e a janela de inventário, com a mesma arte (painel de ferro e couro) e a mesma escala inteira. Uma janela aberta por vez, contando a de inventário
- **Abrir e fechar é só do cliente** (E na porta, Esc, sair da porta); o que vale é cada pedido, conferido pelo servidor. Botão apagado (Taverna sem moedas) é só aviso
- **Estalagem em dois painéis lado a lado** (mochila | baú ou Taverna), como pedido: clicar num slot leva a pilha para o outro lado. Na Taverna, a mochila só mostra (a comida comprada chega ali)
- **Mercador por linha de item**, não por slot: as pilhas do mesmo item somam, e "Tudo" vende todas. A venda tira das últimas pilhas primeiro (`removeItems`)

**Limites conhecidos:** a identidade continua sendo só o nome: quem digitar o seu nome mexe no seu baú. Dá para entrar no labirinto sem passar pela cidade (o caminho é o mesmo de antes).

