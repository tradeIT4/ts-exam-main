import { createServer } from "node:http";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const server = createServer(createApp());

server.listen(port, () => {
  console.log(`Exam reporting API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
