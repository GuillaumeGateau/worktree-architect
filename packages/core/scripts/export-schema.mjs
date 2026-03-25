import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { JobEnvelopeSchema } from "../dist/schemas.js";
import { CreateFeatureBodySchema } from "../dist/features.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "..", "dist");
mkdirSync(dist, { recursive: true });

const jobPath = join(dist, "job-envelope.schema.json");
writeFileSync(
  jobPath,
  JSON.stringify(zodToJsonSchema(JobEnvelopeSchema, "JobEnvelope"), null, 2)
);

const featPath = join(dist, "create-feature-body.schema.json");
writeFileSync(
  featPath,
  JSON.stringify(zodToJsonSchema(CreateFeatureBodySchema, "CreateFeatureBody"), null, 2)
);
