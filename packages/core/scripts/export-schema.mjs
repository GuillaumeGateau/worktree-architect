import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { JobEnvelopeSchema } from "../dist/schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, "..", "dist", "job-envelope.schema.json");
mkdirSync(dirname(out), { recursive: true });
const schema = zodToJsonSchema(JobEnvelopeSchema, "JobEnvelope");
writeFileSync(out, JSON.stringify(schema, null, 2));
