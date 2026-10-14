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
