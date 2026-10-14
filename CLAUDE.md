# CLAUDE.md

Convenções deste projeto. Leia antes de escrever qualquer código.

Contexto de design: `docs/GDD.md`. Decisões e motivos: `docs/DECISIONS.md`. Nunca contrarie uma decisão registrada sem avisar explicitamente que está contrariando e por quê.

## O projeto

Jogo 2D top-down, co-op online para ~4 jogadores. RPG de sobrevivência com extração: o jogador entra num labirinto, sobrevive, e só ganha o que conseguir extrair vivo. Permadeath dentro do labirinto.

Projeto pessoal, feito por um desenvolvedor estudante. Não é produto comercial.

## Stack

- **Cliente:** Phaser 3 + TypeScript, build com Vite
- **Servidor:** Colyseus (Node) + TypeScript
- **Mapas:** Tiled, exportados em JSON, carregados por cliente e servidor
- **Testes:** Vitest
- **Versão do Node:** travada em `.nvmrc`

## Estrutura

```
client/    Phaser, render, input, UI. Só desenha e envia intenção.
server/    Colyseus, salas, autoridade. Decide tudo.
shared/    Regras puras, tipos de estado, constantes de balanceamento.
docs/      GDD, decisões, balanceamento, bestiário, progresso.
assets/    Tilesets, sprites, mapas .tmx/.json
```

## Regras inegociáveis

1. **O cliente nunca calcula nada que importa.** Dano, fome, morte, loot, validação de movimento e visibilidade são decididos no servidor. O cliente envia intenção ("quero andar para lá", "quero atacar isto") e desenha o que o servidor responde. Com permadeath, cálculo no cliente é vetor de cheat direto.

2. **Regras de jogo são funções puras em `shared/`.** Recebem estado e entrada, devolvem estado novo. Nada de acessar Colyseus, Phaser ou I/O de dentro delas. É isso que permite testar sem subir servidor nem navegador.

3. **Números de balanceamento ficam em um arquivo só** (`shared/balance.ts`). Dano, velocidade, taxa de fome, custo de purificação, curva de maestria, raio de visão. Nunca espalhar literais pelo código — esses valores vão ser ajustados centenas de vezes.

4. **Escuridão é raio de replicação, não efeito visual.** Áreas escuras são implementadas reduzindo o que o servidor envia ao cliente. Não desenhe uma máscara preta por cima de dados que o cliente já recebeu.

5. **Interest management sempre.** Andares são grandes. O servidor envia a cada jogador apenas as entidades dentro do raio de visão dele (`VIEW_RADIUS`, via `shouldSee` em `shared/`). Nunca replicar estado de andar inteiro.

6. **Fome é tick do servidor**, não loop do cliente. Temporizador por sala, decremento periódico, sobrevive a desconexão.

## Testes

Testar a lógica pura de `shared/`: cálculo de dano, decaimento de fome, validação de movimento, regras de loot, slots de essência, curva de maestria.

Não testar rendering, input ou integração de Phaser. Custo alto, retorno baixo.

## Estilo

- TypeScript estrito. Sem `any` sem comentário justificando.
- Nomes em inglês no código; comentários e docs em português.
- Funções curtas. Se precisa de comentário para explicar o que faz, provavelmente deveria ser duas funções.
- Sem abstração antecipada. Escreva o caso concreto; generalize quando aparecer o terceiro uso.

## Como trabalhar comigo (o dono do projeto)

- **Explique antes de entregar blocos grandes.** O objetivo não é só o código funcionar; é eu entender o sistema. Código que eu não entendo vira caixa preta que ninguém consegue debugar depois.
- Prefira passos pequenos e verificáveis a features inteiras de uma vez.
- Se uma decisão de arquitetura aparecer no meio da tarefa, pare e pergunte em vez de escolher sozinho.
- Ao terminar algo relevante, sugira a entrada correspondente em `docs/DECISIONS.md`.

## Ainda não fazer

CI/CD, Docker, cobertura de testes, linter rigoroso. São boas práticas reais, mas não resolvem nenhum problema que o projeto tenha hoje. Adicionar quando doer.

## Ordem de construção

Cada etapa precisa ser jogável antes da seguinte:

1. Dois jogadores se movendo numa sala, se vendo
2. Mapa do Tiled com colisão
3. Mobs com spawn por área
4. Combate e vida
5. Fome e morte
6. Loot e extração
7. Essências e slots
8. Maestria de armas
9. Cidade, loja, baú
10. Classes e vilas
11. Facções e rotas sociais

Fatia mínima jogável = até o passo 7, com um andar, duas áreas, 3–4 mobs, duas armas e três essências.
