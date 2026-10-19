# Arte e mapas gerados (Python)

Transforma a arte nova (cidade em `assets/tilesets/novos tilesets/`, labirinto em `assets/tilesets/labirinto/`) em
assets do jogo e monta `assets/maps/city.json` e `assets/maps/dungeon_floor1.json`.

## Preparar (uma vez)

```bash
py -m venv tools/assets/.venv
tools/assets/.venv/Scripts/python.exe -m pip install pillow numpy
```

O `.venv` e a pasta `tools/assets/build/` (intermediários) ficam fora do git.

**As imagens originais também ficam fora do git** (são grandes; o jogo só usa o que os scripts geram):
`assets/tilesets/novos tilesets/` (cidade), `assets/tilesets/labirinto/` (labirinto) e `assets/tilesets/interface/`
(pacote Paper UI). Para rodar os scripts, elas precisam estar nessas pastas: guarde uma cópia. Os sprites das classes
(`perssonagens/`) e dos inimigos (`Inimigos/`) são pequenos e ficam no git (o jogo usa as cópias que os scripts gravam
em `assets/characters/` e `assets/mobs/`).

## Rodar (da raiz do projeto)

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_city.py
tools/assets/.venv/Scripts/python.exe -I tools/assets/build_city.py
tools/assets/.venv/Scripts/python.exe -I tools/assets/render_map.py assets/maps/city.json cidade.png --scale 0.5
```

1. **`process_city.py`**: lê as folhas de `novos tilesets/` (lista no topo do arquivo), tira o fundo (o
   quadriculado "falso" das imagens geradas, preenchendo a partir da borda, e os buracos brancos presos dentro da
   arte), recorta cada peça pelo desenho (pedaços conectados; cada casa da grade 3x2 fica com a célula onde está o
   centro dela), reduz por média de área e grava em `assets/tilesets/city/` (`houses/house_NN.png`, `landmarks/`
   com Guilda, Forja e Estalagem, `props/`, `portal.png`). `houses/`, `landmarks/` e `props/` são apagadas e
   geradas de novo a cada rodada. Os tiles de chão (32x32: piso nobre de `Tileset.png` e paralelepípedo rústico) e as
   folhas de conferência (`contato-*.png`) vão para `tools/assets/build/`. Escalas (casa pela porta, ~60 px), o corte
   da folha `Ferreiro e Mercador` (46% da largura) e os nomes dos enfeites ficam no topo do arquivo.
2. **`build_city.py`**: monta o tileset de chão (`city/floor.png`: piso nobre, guias das 4 direções e cantos
   montados com peças da folha, paralelepípedo rústico com as variantes igualadas) e o mapa em fileiras (desenho no
   topo do arquivo): ruas, calçadas, praça, prédios, enfeites, portal, spawns e luzes. Colisão: enfeites e móveis têm
   um retângulo na base (`FOOTPRINT`, frações da imagem); casas, um bloco medido na arte (largura pelos pixels opacos
   dos 15% de baixo, abaixo das placas penduradas; altura da base até a metade da imagem); Guilda, Estalagem e Forja,
   retângulos medidos à mão (`LANDMARK_SHAPES`, px da imagem: corpo da linha da porta até a metade da altura + caixas
   do que fica na frente) e um pivô de Y-sorting na linha da porta (`SORT_LINE`). Todo retângulo vai com a classe
   `macico` (o servidor marca toda célula que ele toca). No fim, confere prédios sobrepostos, prédio cobrindo rua, enfeite sólido no meio
   da rua e objeto fora do mapa, e imprime os problemas (o esperado é "problemas: nenhum").
3. **`render_map.py`**: desenha o mapa como o jogo (objetos ordenados pela base ou pelo pivô). `--solid grade.json`
   pinta a colisão calculada pelo servidor (a grade vem do `dump_grid.ts`); `--debug` desenha o contorno dos
   retângulos de colisão, a linha do Y-sorting de cada objeto sólido (azul) e o alcance dos pontos de E (verde).
   Diagnóstico completo da cidade:

   ```bash
   npx tsx tools/assets/dump_grid.ts assets/maps/city.json tools/assets/build/city_grid.json
   tools/assets/.venv/Scripts/python.exe -I tools/assets/render_map.py assets/maps/city.json \
       tools/assets/build/debug_city_collisions.png --scale 1 --solid tools/assets/build/city_grid.json --debug
   ```

> **Atenção:** rodar o `build_city.py` sobrescreve `city.json`, inclusive o que tiver sido editado à mão no Tiled.

## Como o mapa é organizado

- Camada de tiles `chao` (tileset `city/floor`). Nenhum tile de chão é sólido.
- Camada de objetos `objetos`: prédios, enfeites e portal, de uma coleção de imagens (`city/objects`). No Tiled,
  cada tile dessa coleção tem a propriedade `solid` e retângulos de colisão desenhados nele (editor de colisão do
  Tiled); mover o objeto no Tiled leva a colisão junto. Retângulo com a classe (Class) `macico` bloqueia toda célula
  que toca; sem ela, só as células cujo centro está dentro (é o caso dos enfeites do labirinto). A propriedade inteira
  `sortY` do tile, se houver, é a linha (px a partir do topo da imagem) que conta como base no Y-sorting.
- Camadas de pontos `spawns`, `portal` e `interacoes` (portas da rua com o id do prédio, `INTERACTIONS` em
  `build_city.py`; portas de dentro `<prédio>-exit` e móveis com E, em `interiors.py`). Ponha cada porta da rua logo
  abaixo da linha do Y-sorting do prédio (a base, ou o `sortY`): acima dela, o prédio é desenhado por cima de quem
  está ali. O teste `shared/src/cityMap.test.ts` confere isso no mapa gerado.
- Camada de pontos `chegadas` (onde a porta da rua deixa o jogador, dentro de cada prédio) e de retângulos `regioes`
  (a cidade e cada interior: o cliente prende a câmera no lugar onde o jogador está).

## Interiores dos prédios (Guilda, Forja, Estalagem)

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_interiors.py
tools/assets/.venv/Scripts/python.exe -I tools/assets/build_city.py
```

1. **`process_interiors.py`** (~13 s): lê `Tiles_interiores.png`, `Interior_guilda.png`, `interior_ferreiro.png`,
   `Interior_casacomida.png` e `Bau_casadecomida.png` (em `novos tilesets/`). Mesma limpeza dos kits do labirinto
   (`clean`, `kit_objects` de `process_labyrinth.py`), mais: janelas com quadriculado mais contrastado limpas com um limiar
   mais tolerante (`RELAXED_BACKGROUND`) e a sombra cinza desenhada embaixo dos móveis virada preto semitransparente
   (`soften_shadows`). `decoracoes_guilda.png` (`DECO`) já vem com fundo transparente e sombra cinza-escura: ali o
   fundo é o alfa e a sombra vira preto semitransparente (`dark_sheet_art`). `enfeites_interiorferreiro.png` também, e as
   peças coladas umas nas outras saem por retângulo com áreas excluídas (`SMITHY_DECO`, `SMITHY_CUTS`, `cut_rect`);
   `derocacao_taverna.png` idem (`TAVERN`). O tamanho final de cada móvel vem de `TARGETS` (px, na régua do jogador). Grava os móveis em `assets/tilesets/city/interior/` e os 16 pisos em
   `tools/assets/build/interior-floor/`. Nome, centro e escala de cada móvel no topo (`GUILD`, `SMITHY`, `INN`, `CHEST`).
2. **`interiors.py`** (usado pelo `build_city.py`): a planta de cada sala (pisos, paredes internas, móveis, pontos),
   as paredes geradas a partir dos pisos (na Guilda: pedra com viga e rodapé, painel de madeira, topo de madeira e
   degrau), os tapetes cortados da amostra inteira (`carpet_tiles`: o quadrado e a passadeira girada, de
   `build/interior-floor/grande/`), a colisão (`FOOTPRINT`) e as luzes (`LIGHTS`) dos móveis. As salas ficam ao
   leste da cidade, a `INTERIOR_GAP` tiles de vazio dela e uma da outra.

## Interface de registro e personagens

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_ui.py
```

Lê o pacote **Paper UI** (Humble Pixel) em `assets/tilesets/interface/Humble Gift - Paper UI System v1.1/` e as
classes em `assets/tilesets/perssonagens/`. Grava em `assets/ui/` só as peças usadas, **recoloridas para dark fantasy**
(papel envelhecido, verde -> carmesim, contorno -> sépia), as tiras de animação (carimbo e revelação do conteúdo) e a
marca do carimbo em cera carmesim; e copia os sprites das classes para `assets/characters/<classe>/<direção>.png`.
Os GIFs de caminhada (`walk/<direção>.gif`, 6 quadros de 96x96) viram fitas horizontais em
`assets/characters/<classe>/walk-<direção>.png`, sem reamostrar. Se faltar uma direção, o script espelha o lado
leste (para oeste) ou usa a cardinal mais próxima (para diagonal), e avisa.

Por fim grava `assets/characters/hand_sockets.json`: a mão que segura a arma em cada quadro, por classe, animação
(`idle`, `walk` e `attack` quando houver `attack-<direção>.png`) e direção, como `{dx, dy, behindBody}` em px a partir
dos pés do sprite. A mão é sempre a direita do personagem; a do parado é a tabela `HAND_IDLE`, marcada no punho da arte;
nos quadros das fitas, o punho do parado (9x9 px) é procurado a até 8 px do mesmo lugar. Só os sockets, sem
reprocessar o resto:

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_ui.py --sockets
```

> **Licença do Paper UI:** pode usar e modificar em jogos; **não pode redistribuir** o pacote, nem modificado.
> Enquanto `assets/tilesets/interface/` e `assets/ui/` estiverem no repositório, ele não pode ser público.

## Labirinto, 1º andar (500x500)

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_labyrinth.py
tools/assets/.venv/Scripts/python.exe -I tools/assets/build_labyrinth.py
tools/assets/.venv/Scripts/python.exe -I tools/assets/render_map.py assets/maps/dungeon_floor1.json labirinto.png --scale 0.25
```

1. **`process_labyrinth.py`** (~15 s): tira o fundo de `chao_labirinto.png`, `enfeites_labirinto.png` e dos 4 kits
   (`Kit de Acampamentos`, `Kit de Covis`, `Kit de Marcos de Navegação e Ruínas do Labirinto`, `Kit de Pisos Variados
   do Labirinto`). Nos kits, os vãos presos (grades, costelas, arcos, dormentes) saem e o brilho da gosma fica: buraco
   claro é brilho se a borda for clara e colorida (`HIGHLIGHT_RING_*`), e nos objetos de `GLOSSY` nunca se apaga buraco.
   Objetos achados por dilatação de 9 px; pedaço solto a até `ATTACH_PX` vai com o objeto mais perto. O chão vira blocos
   de 32x32 em `tools/assets/build/labyrinth-floor/` (`floor-L-C.png` da caverna, `<tipo>-C.png` dos pisos novos:
   ruína, terra tribal, mina, musgo ácido). Nome, centro aproximado e escala de cada objeto ficam no topo do arquivo
   (`PROPS`, `CAMP`, `LAIRS`, `LANDMARKS`).
2. **`build_labyrinth.py`** (~5 s): malha de labirinto (`CELL`, `STRAIGHT`, `LOOP_CHANCE`, `DEAD_END_ROOM`);
   zonas de monstros nos 4 cantos e zona normal em cruz (`ZONES`, `CROSS_HALF`), com a divisa ondulando
   (`BORDER_WOBBLE`) e o piso e os enfeites de cada zona entrando aos poucos (`BLEED_IN`, `BLEED_OUT`,
   `THEME_MIN`, `THEME_MAX`, `THEME_FLOOR`, `ZONE_DECOR`); salões (`HALL_ZONES`, `HALL_RECIPES`), câmaras
   de saída nas pontas (`EXIT_CHAMBERS`, entre dois obeliscos), avenidas de ruína com praças e marcos nos cruzamentos,
   borda de caverna nos outros corredores. Gera `labyrinth/floor.png` só com as combinações de tile usadas, espalha
   enfeites, confere tudo com um flood fill só e grava as camadas que o servidor lê (`areas` em blocos de
   `AREA_BLOCK` tiles seguindo a divisa, `spawns`, `exits`, `luzes`). No fim, imprime as coordenadas do portal de
   chegada e das 4 saídas. Os nomes em `ZONES` precisam bater com `AREAS` em `shared/src/balance.ts`. O sorteio é
   fixo (sementes no código): rodar de novo dá o mesmo mapa.

> **Atenção:** rodar o `build_labyrinth.py` sobrescreve `dungeon_floor1.json`, inclusive o que tiver sido editado à mão no Tiled.

## Luzes dos mapas

`lights.py` é usado pelos dois geradores: escreve a camada de pontos `luzes` (nome do ponto = tipo da luz). Na cidade,
as janelas acesas das casas e dos marcos, a fornalha da Forja (a maior mancha dela), as lanternas dos postes e as velas
das mesas da taverna são achadas na própria arte (manchas de pixels claros e alaranjados); braseiros e portal têm uma
luz cada (`city_lights` em `build_city.py`). No labirinto, cada cristal, rocha de minério, cogumelo, tocha e o
portal ganham a sua (`GLOWING` em `build_labyrinth.py`). O raio de cada tipo fica em `LIGHT_RADIUS` (`shared/src/balance.ts`).

## HUD (status, barra rápida, mochila)

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_hud.py
```

Lê `assets/tilesets/interface/hud_status_kit.png` e `hud_inventario_kit.png` (fora do git) e grava em `assets/ui/hud/`:
as peças sem fundo e reduzidas por área (tamanhos em "pixels de HUD" no topo do script; as molduras de raridade saem em
48, 34 e 28, uma para a barra, outra para a mochila e outra para o altar de essências; o painel da janela em 360 de largura), as tiras das 3 barras com 100% do vão
das calhas, o rosto de cada classe (recortado do sprite parado, centrado pela testa) os ícones de espada (arma inicial) e cadeado (slot de essência trancado) e um ícone 16x16 para cada item
(`ICONS`, desenhados no código: item novo sem ícone aparece com a sigla). Desenha também o pergaminho dos status
(`status_scroll.png`, 300x640: papel envelhecido da cor do Paper UI entre dois rolos com pontas de madeira; a área do
texto vai em `layout.json` como `status_scroll.content`). Os vãos medidos na arte vão para `layout.json`,
que o cliente (`client/src/hud.ts`) usa para posicionar retrato, barras e slots.

## Inimigos (parado e caminhada)

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_mobs.py
```

Lê `assets/tilesets/Inimigos/<Tipo>/` (`Idle/rotations/` com as 8 direções paradas e, se houver, `walk/<direção>.gif` com
quadros 96x96) e grava em `assets/mobs/<tipo>/` (tipo em minúsculas): o parado copiado e uma fita `walk-<direção>.png` para
cada GIF que existir, sem reamostrar. Direção sem GIF fica sem fita (o cliente usa a cardeal do lado, ou o sprite parado).
Mob novo: pasta em `Inimigos/` com o nome do tipo de `MOB_KINDS`, rodar o script e medir os pés em `MOB_ART` (`client/src/main.ts`).

## Armaduras vestidas (camadas por quadro)

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/build_armor_layers.py
```

Gera as camadas que vestem o personagem com Elmo, Peitoral, Calça e Bota: `assets/characters/<classe>/armor/<visual>/<peça>/`
(`<direção>.png` 64x64 do parado e `walk-<direção>.png` com os 6 quadros 96x96), um arquivo por quadro do sprite do corpo, e a
folha de conferência `tools/assets/build/armor_<visual>.png`. Para cada quadro, separa as faixas do corpo pelas linhas
marcadas de cada classe (`BODY`: tornozelo, quadril, pescoço e testa, em px acima dos pés; pescoço e testa seguem o
balanço da caminhada) e recolore os pixels do próprio sprite com a paleta do metal pelo brilho: a peça herda contorno,
sombreado e movimento. Ficam de fora o punho da espada (o quadrado que o cliente redesenha por cima do cabo), a outra mão,
os braços (pela largura do tronco) e, no peitoral e na calça, o cabelo e a capa (`keeps_over_armor`). Rodar de novo quando
mudar a arte das classes ou os pontos de mão (`hand_sockets.json`). O visual de cada peça é `ITEMS[...].equip.look`.

## Armas

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/weapons.py
```

Desenha as armas em pixel art em `assets/weapons/<arma>.png` (48x48, fundo transparente, na horizontal apontando para
a direita, cabo em x 6-14 e ponta em x 44, y 24). O cliente prende o punho à mão do personagem (origem 0,18 x 0,5, no ponto de `hand_sockets.json`) e gira a
arma em volta dele.

