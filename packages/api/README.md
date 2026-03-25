# @orch-os/api

Fastify server: **SQLite** persistence, **SSE** events, **REST** under `/api/v1/*`, static **`@orch-os/ui`** build at `/`.

```ts
import { buildServer } from "@orch-os/api";

const app = await buildServer({ cwd: process.cwd() });
await app.listen({ port: 45210, host: "127.0.0.1" });
```
