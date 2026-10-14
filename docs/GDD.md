# GDD — RPG co-op de extração

Documento de design. Descreve o que o jogo é. Decisões e seus motivos ficam em `DECISIONS.md`.

## Conceito

RPG 2D top-down, co-op online para poucos jogadores (alvo: 4). Mundo de fantasia com quatro povos. O centro do jogo é um labirinto de vários andares onde o jogador entra para sobreviver, coletar e **voltar vivo**. Nada do que você mata vale alguma coisa até você extrair.

Gênero de referência: extraction game (Tarkov, Dark and Darker) com estética e ritmo de ARPG pixel art top-down (Hero Siege). Inspiração narrativa: manhwa *Surviving the Game as a Barbarian* — usado como referência de tom, não de conteúdo.

Objetivo do projeto: jogo pessoal, jogável com amigos. Não é produto comercial.

## Loop central

1. Preparar — escolher essências equipadas, comprar comida, equipar armas.
2. Entrar no labirinto pelo portal da cidade principal.
3. Sobreviver — explorar, lutar, gerenciar fome, evitar morrer.
4. Extrair — chegar a um portal de saída com o que coletou.
5. Investir — vender, purificar essências, pagar hotel/casa, avançar facções.
6. Voltar mais forte.

Morrer no labirinto = perder o personagem (ver Morte e linhagem).

## Mundo

- **Quatro vilas**, uma por povo. É onde cada classe desbloqueia os poderes próprios da sua classe.
- **Cidades principais**, onde todos os povos convivem. Contêm loja, hotel, casas para alugar, NPCs de facção e o **portal do labirinto**.
- **Labirinto**: dungeon de vários andares. Cada andar é grande, feito à mão, com biomas e mobs distintos por área. Portais internos levam ao próximo andar.

### Andar 1 (referência)

Caverna com 4 áreas distintas, cada uma com seu conjunto de mobs. Uma das áreas é a zona dos goblins: escura, com visão reduzida sem tocha.

O layout do andar é **fixo** (não gerado proceduralmente). A variação por run vem de:

- spawn aleatório de mobs dentro de cada área
- ponto de entrada do jogador aleatório, com restrição de área
- portal de saída/descida em posição variável entre locais possíveis
- (planejado) rotas bloqueadas e condição ambiental sorteada por run

Efeito **fixo de área** (escuridão dos goblins) define a identidade do lugar. Efeito **variável de run** (infestação, etc.) impede decoreba. Os dois coexistem.

## Classes e povos

Quatro classes: **mago, bárbaro, povo fera, elfo**. Cada uma começa na sua vila e desbloqueia lá os poderes próprios.

Princípio de balanceamento: **assimetria funcional, não hierárquica**. Nenhuma classe é "a fraca". Cada uma é forte em áreas e situações diferentes, de modo que a party se beneficia de diversidade.

Exemplo de direção (não fechado): bárbaro com muito dano e vida, mas consumo de comida maior e sem acesso a itens mágicos; elfo no oposto.

## Sistema de poder

Status **não** sobem por nível. Sobem por essência.

### Essências

- Dropam de monstros e precisam ser **extraídas** para valer.
- Dão aumento de status e podem conceder habilidades únicas, ativas ou passivas.
- O efeito depende do monstro de origem.
- **Afinidade de área**: uma essência pode valer muito numa área e quase nada em outra (ex.: essência de goblin dando visão no escuro). Isso cria build por destino, não build universalmente ótima.

### Slots

O número de essências equipadas é limitado pelo **nível**: nível 1 = 1 slot, nível 2 = 2 slots, e assim por diante.

### Purificação

Para liberar um slot, a essência precisa ser destruída por um NPC da igreja ("purificação"), a um custo alto em moedas. Troca só é possível na cidade — não dentro do labirinto.

Caminho alternativo planejado para jogadores da rota criminosa: purificador clandestino, mais barato e com risco.

### Maestria de armas

Progressão **por uso**, por tipo de arma: machado, espada, escudo, lança, arco, cajado, varinha e outras.

Curva: chegar a competente é rápido; especializar é lento. Isso mantém barato experimentar e caro dominar.

## Progressão e nível

Nível não dá status — dá **slots de essência**. Fontes de XP:

- **Primeira kill de cada entrada do bestiário.** Matar um mob pela primeira vez dá XP; repetir não dá.
- **Variantes contam como entrada própria.** "Goblin inteligente" e "goblin venenoso" são entradas separadas do bestiário, cada uma com sua primeira kill. Variante altera comportamento (chama reforços, imune a corte, envenena), não apenas números.
- **Feitos.** Descer de andar, extrair vivo N vezes, matar um mini-boss, completar linha de facção.

O bestiário é visível ao jogador e funciona como registro de conhecimento: entradas faltantes, fraquezas descobertas, drops conhecidos. Ele é a progressão por conhecimento, e sobrevive à morte.

**Em aberto:** XP de primeira kill é um recurso finito — o bestiário define o teto de nível. Decidir se o teto é intencional ou se os feitos carregam os níveis altos.

**Evitar:** feitos baseados em tempo de permanência ("ficar X minutos no labirinto"). São farmáveis sem risco e contradizem o loop de extração. Feitos devem exigir exposição ao perigo.

## Morte, linhagem e persistência

Permadeath **dentro do labirinto**. Cidades e vilas são seguras.

Ao morrer:

- o personagem acaba — nível, maestria e essências equipadas se perdem
- a **linhagem** persiste: casa, baú, reputação de facção e bestiário

Justificativa narrativa: o novo personagem é parente, aprendiz ou membro do mesmo clã; a igreja e a nobreza o reconhecem pelo nome.

**Em aberto:** maestria zera totalmente na morte (ponto de partida atual) ou o novo personagem herda uma fração. É o número mais provável de precisar de ajuste depois dos primeiros testes.

## Sobrevivência

Sistema de **fome**: obriga o jogador a levar comida para o labirinto. Implementado como tick do servidor, não como loop de cliente.

Comida ocupa espaço, o que cria a tensão central da preparação: mais comida = mais tempo lá dentro = menos espaço para loot.

## Economia e rotas sociais

- **Loja** nas cidades principais para vender o que foi extraído.
- **Hotel** para alugar, barato e temporário.
- **Casa** para alugar/comprar — guarda o baú persistente, portanto é progresso real.
- **Taxas** da cidade: quem não paga vira criminoso.

Rotas de facção com consequências e missões próprias:

- **Nobreza** — missões com nobres
- **Igreja** — caminho dos paladinos, purificação de essências
- **Crime** — mercado negro, purificador clandestino, rotas alternativas para o labirinto

Princípio: criminalidade é **caminho opcional**, não castigo. Perde-se acesso à cidade formal, ganha-se acesso a outra economia.

**Em aberto:** taxa fixa é feedback negativo — cobra mais de quem está indo mal e pode criar espiral descendente. Reavaliar formato (progressiva, opcional, atrelada a benefício).

## Princípio de design transversal

O jogo premia **planejamento**, não reflexo. As decisões importantes (quanta comida levar, quais essências equipar, até onde descer, quando voltar) acontecem antes e durante, não no timing de um clique. Combate deve ser telegrafado o bastante para que morrer seja consequência de decisão ruim, não de reflexo perdido — caso contrário permadeath vira punição aleatória.
