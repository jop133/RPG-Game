# Progresso

Onde o projeto está agora. Atualizado ao fim de cada passo. O porquê das escolhas fica em `DECISIONS.md`; aqui fica só o quê e o estado.

## Agora

**Passo 1 concluído.** Próximo: passo 2, mapa do Tiled com colisão (e, junto, o interest management adiado do passo 1).

**Limitações conhecidas do passo 1** (todas resolvidas por passos futuros):
- Sem limites de mundo: dá para andar para fora da tela. Resolve no passo 2 (colisão).
- Todos nascem no mesmo ponto fixo. Resolve no passo 2 (spawn vindo do mapa).
- O servidor replica todos os jogadores para todos. Exceção registrada em `DECISIONS.md`; resolve no passo 2.
- O movimento dos outros deve parecer "em degraus" (o servidor atualiza 20× por segundo e o cliente desenha a 60). Se incomodar, a correção é interpolação, que é só visual.

## Ordem de construção

- [x] 0. Fundação: repositório, workspaces (`client`, `server`, `shared`), cliente e servidor subindo vazios
- [x] 1. Dois jogadores se movendo numa sala, se vendo
- [ ] 2. Mapa do Tiled com colisão
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

## Histórico

- **2026-10-13** — Passo 0 concluído. Repositório criado, workspaces configurados, Phaser 3.90 e Colyseus 0.18 subindo sem erro.
- **2026-10-13** — Passo 1 concluído. Movimento WASD autoritativo no servidor (`shared/src/movement.ts`, 8 testes). Verificado com duas abas: cada uma vê a outra andar, e o quadrado de quem sai some. Verificado também por script: 160 px/s medidos no servidor, input malicioso ignorado.
