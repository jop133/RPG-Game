import { defineServer } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";

const port = Number(process.env.PORT) || 2567;

const server = defineServer({
  rooms: {},
  transport: new WebSocketTransport(),
});

await server.listen(port);
