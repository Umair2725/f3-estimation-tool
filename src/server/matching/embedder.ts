// Text embeddings for matching (specs/feature-matching "Local embeddings"). "local" runs a small
// open-source model on this server, so estimate text never leaves it; "stub" is a deterministic
// stand-in for tests. No "server-only" import: scripts use this too.
import { createHash } from "node:crypto";
import path from "node:path";

export const DIMENSIONS = 384;
export const LOCAL_MODEL = "Xenova/bge-small-en-v1.5";

export type Embedder = {
  name: "local" | "stub";
  /** Similarity at or above which a match counts as reliable. */
  threshold: number;
  embed(texts: string[]): Promise<number[][]>;
};

function normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((n, v) => n + v * v, 0)) || 1;
  return vector.map((v) => v / length);
}

const STOP = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "for",
  "to",
  "in",
  "on",
  "with",
  "sub",
  "tasks",
]);

/** Lowercase words, without punctuation, stop words or a plural "s". */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
}

/**
 * Hashed bag of words: shared words give a higher cosine similarity. For tests only. The part
 * label before the first ":" is left out (search already filters by part), and signed hashing
 * makes bucket collisions cancel out rather than add up.
 */
export const stubEmbedder: Embedder = {
  name: "stub",
  // Calibrated on sample pairs: related 0.50–0.89, unrelated 0 or below.
  threshold: 0.4,
  async embed(texts) {
    return texts.map((text) => {
      const vector = new Array<number>(DIMENSIONS).fill(0);
      const body = text.includes(":") ? text.slice(text.indexOf(":") + 1) : text;
      for (const word of tokens(body)) {
        const hash = createHash("sha1").update(word).digest();
        vector[hash.readUInt16BE(0) % DIMENSIONS] += hash[2] & 1 ? 1 : -1;
      }
      return normalize(vector);
    });
  },
};

type Extractor = (
  texts: string[],
  options: { pooling: "cls"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;
let extractor: Promise<Extractor> | undefined;

export function modelCacheDir(configured?: string): string {
  return path.resolve(configured || path.join(process.cwd(), ".cache", "models"));
}

/** Loads the model once per process (downloaded on first use, then cached on disk). */
export function localEmbedder(cacheDir?: string): Embedder {
  return {
    name: "local",
    // Calibrated on sample pairs (same part): related 0.82–0.88, unrelated 0.66–0.72.
    threshold: 0.77,
    async embed(texts) {
      if (texts.length === 0) return [];
      extractor ??= (async () => {
        const { pipeline, env } = await import("@huggingface/transformers");
        env.cacheDir = modelCacheDir(cacheDir);
        return (await pipeline("feature-extraction", LOCAL_MODEL, {
          dtype: "q8",
        })) as unknown as Extractor;
      })();
      const run = await extractor;
      const output = await run(texts, { pooling: "cls", normalize: true });
      return output.tolist();
    },
  };
}

export function embedderFor(settings: {
  EMBEDDINGS_PROVIDER: "local" | "stub";
  EMBEDDINGS_CACHE_DIR?: string;
}): Embedder {
  return settings.EMBEDDINGS_PROVIDER === "stub"
    ? stubEmbedder
    : localEmbedder(settings.EMBEDDINGS_CACHE_DIR);
}

/** pgvector's text form: "[0.1,0.2,…]". */
export const toVectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;
