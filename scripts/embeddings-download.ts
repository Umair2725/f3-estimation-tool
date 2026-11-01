// Downloads the local embedding model once, so the server never has to (specs/feature-matching).
// The Dockerfile runs this at build time. Usage: npm run embeddings:download
import { LOCAL_MODEL, localEmbedder, modelCacheDir } from "../src/server/matching/embedder";

try {
  process.loadEnvFile();
} catch {
  // no .env file (CI and containers set variables directly)
}

const dir = modelCacheDir(process.env.EMBEDDINGS_CACHE_DIR);
const started = Date.now();
localEmbedder(process.env.EMBEDDINGS_CACHE_DIR)
  .embed(["Backend (Node.js): User login."])
  .then(([vector]) => {
    console.log(
      `${LOCAL_MODEL} ready in ${dir} (${vector.length} dimensions, ${Date.now() - started} ms)`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
