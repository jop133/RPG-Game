import { fileURLToPath } from "node:url";
import { Store } from "./db";

// Um banco por processo, usado por todas as salas.
// DB_FILE permite um banco separado (ex.: servidores de teste não tocam no banco de verdade).
export const store = new Store(process.env.DB_FILE ?? fileURLToPath(new URL("../../data/rpg-extracao.db", import.meta.url)));
