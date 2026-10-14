import { defineRoom, defineServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";

const port = Number(process.env.PORT) || 2567;

const server = defineServer({
  rooms: {
    game: defineRoom(GameRoom),
  },
  transport: new WebSocketTransport(),
});

await server.listen(port);
