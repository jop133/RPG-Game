import { defineRoom, defineServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { CityRoom } from "./CityRoom";
import { DEV_TOOLS } from "./devTools";
import { GameRoom } from "./GameRoom";
import { SandboxRoom } from "./SandboxRoom";

const port = Number(process.env.PORT) || 2567;

const server = defineServer({
  rooms: {
    city: defineRoom(CityRoom),
    game: defineRoom(GameRoom),
    // A Sala de Testes só existe com as ferramentas de dev.
    ...(DEV_TOOLS ? { sandbox: defineRoom(SandboxRoom) } : {}),
  },
  transport: new WebSocketTransport(),
});

await server.listen(port);
