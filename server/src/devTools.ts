// Ferramentas de dev (Sala de Testes, comandos "dev_command", painel F2): só com DEV_TOOLS=1 no ambiente do servidor
// ou com --dev-tools na linha de comando (npm run dev:sandbox; no Windows o npm não aceita VAR=1 no script).
// Desligado por padrão: no servidor onde os amigos entram, ninguém fica imortal nem cria ouro (escolha do dono do
// projeto). Ver CLAUDE.md.
export const DEV_TOOLS = process.env.DEV_TOOLS === "1" || process.argv.includes("--dev-tools");
