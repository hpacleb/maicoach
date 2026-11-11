import { createApp, loadCatalog } from "./app";
const port = Number(process.env.PORT || 3107);
const server = createApp(loadCatalog()).listen(port, "127.0.0.1", () =>
  console.log(`MaiCoach ready at http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close(() => process.exit(0)));
