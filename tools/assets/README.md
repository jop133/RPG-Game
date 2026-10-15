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
   topo do arquivo): ruas, calçadas, praça, prédios, enfeites, portal, spawns e luzes. A colisão de cada objeto é um
   retângulo na base (`FOOTPRINT`). No fim, confere prédios sobrepostos, prédio cobrindo rua, enfeite sólido no meio
   da rua e objeto fora do mapa, e imprime os problemas (o esperado é "problemas: nenhum").
3. **`render_map.py`**: desenha o mapa como o jogo (objetos ordenados pela base). `--solid grade.json` pinta a
   colisão calculada pelo servidor.

> **Atenção:** rodar o `build_city.py` sobrescreve `city.json`, inclusive o que tiver sido editado à mão no Tiled.

## Como o mapa é organizado

- Camada de tiles `chao` (tileset `city/floor`). Nenhum tile de chão é sólido.
- Camada de objetos `objetos`: prédios, enfeites e portal, de uma coleção de imagens (`city/objects`). No Tiled,
  cada tile dessa coleção tem a propriedade `solid` e um retângulo de colisão desenhado na base (editor de colisão
  do Tiled); mover o objeto no Tiled leva a colisão junto.
- Camadas de pontos `spawns`, `portal` e `interacoes` (portas dos prédios com janela; nome do ponto = id do prédio,
  `INTERACTIONS` em `build_city.py`). Ponha cada porta logo abaixo da base do prédio: acima dela, o prédio é desenhado
  por cima de quem está ali.

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

> **Licença do Paper UI:** pode usar e modificar em jogos; **não pode redistribuir** o pacote, nem modificado.
> Enquanto `assets/tilesets/interface/` e `assets/ui/` estiverem no repositório, ele não pode ser público.

## Labirinto, 1º andar (Caverna de Cristal)

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_labyrinth.py
tools/assets/.venv/Scripts/python.exe -I tools/assets/build_labyrinth.py
tools/assets/.venv/Scripts/python.exe -I tools/assets/render_map.py assets/maps/dungeon_floor1.json labirinto.png --scale 0.25
```

1. **`process_labyrinth.py`**: tira o fundo de `chao_labirinto.png` e `enfeites_labirinto.png`. O chão vira 16 blocos de
   32x32 em `tools/assets/build/labyrinth-floor/` (linhas: pedra, terra, musgo, pedra com cristal). Os enfeites são achados
   com a máscara dilatada (partes soltas, como a chama da tocha, ficam junto) e cada um é recortado só com os próprios
   pixels; vão para `assets/tilesets/labyrinth/props/`. Nome, centro aproximado e escala de cada enfeite ficam no topo do arquivo.
2. **`build_labyrinth.py`**: escava a caverna (salas e túneis em `CHAMBERS`/`TUNNELS`), escolhe o chão de cada
   região, gera `labyrinth/floor.png` só com as combinações de tile usadas (parede com face de pedra, chão com sombra),
   espalha enfeites e grava as camadas que o servidor lê (`areas`, `spawns`, `exits`). Os nomes das áreas
   (`AREA_RECTS`) precisam bater com `AREAS` em `shared/src/balance.ts`. O sorteio é fixo (`random.Random(3)`):
   rodar de novo dá o mesmo mapa; trocar a semente dá outro.

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
(`ICONS`, desenhados no código: item novo sem ícone aparece com a sigla). Os vãos medidos na arte vão para `layout.json`,
que o cliente (`client/src/hud.ts`) usa para posicionar retrato, barras e slots.

## Inimigos (parado e caminhada)

```bash
tools/assets/.venv/Scripts/python.exe -I tools/assets/process_mobs.py
```

Lê `assets/tilesets/Inimigos/<Tipo>/` (`Idle/rotations/` com as 8 direções paradas e, se houver, `walk/<direção>.gif` com
quadros 96x96) e grava em `assets/mobs/<tipo>/` (tipo em minúsculas): o parado copiado e uma fita `walk-<direção>.png` para
cada GIF que existir, sem reamostrar. Direção sem GIF fica sem fita (o cliente usa a cardeal do lado, ou o sprite parado).
Mob novo: pasta em `Inimigos/` com o nome do tipo de `MOB_KINDS`, rodar o script e medir os pés em `MOB_ART` (`client/src/main.ts`).

