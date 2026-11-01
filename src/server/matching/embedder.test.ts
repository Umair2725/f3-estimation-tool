import { describe, expect, it } from "vitest";
import { entryText, queryText } from "@/lib/matching/suggest";
import { DIMENSIONS, localEmbedder, stubEmbedder, tokens } from "./embedder";

const cosine = (a: number[], b: number[]) => a.reduce((n, x, i) => n + x * b[i], 0);
const query = queryText({ partLabel: "Backend (Node.js)", featureName: "User login" });
const close = entryText({
  partLabel: "Backend (Node.js)",
  title: "Login and sign-up",
  subTaskTitles: ["Login API", "Password reset"],
});
const far = entryText({
  partLabel: "Backend (Node.js)",
  title: "Payments",
  subTaskTitles: ["Stripe checkout", "Refunds"],
});

describe("stub embedder (tests only)", () => {
  it("is deterministic, normalised and ranks shared wording higher", async () => {
    const [a, b] = await stubEmbedder.embed([query, query]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(DIMENSIONS);
    expect(cosine(a, a)).toBeCloseTo(1, 6);
    const [q, c, f] = await stubEmbedder.embed([query, close, far]);
    expect(cosine(q, c)).toBeGreaterThan(stubEmbedder.threshold);
    expect(cosine(q, f)).toBeLessThan(stubEmbedder.threshold);
  });

  it("splits words without stop words or plural s", () => {
    expect(tokens("The Work Orders, and sync!")).toEqual(["work", "order", "sync"]);
  });
});

// Opt in with MATCHING_LOCAL_MODEL=1 (downloads the model on first run; skipped in CI).
describe.runIf(process.env.MATCHING_LOCAL_MODEL === "1")("local model", () => {
  it("ranks a close title above the threshold and an unrelated one below", async () => {
    const embedder = localEmbedder(process.env.EMBEDDINGS_CACHE_DIR);
    const [q, c, f] = await embedder.embed([query, close, far]);
    expect(q).toHaveLength(DIMENSIONS);
    expect(cosine(q, c)).toBeGreaterThan(embedder.threshold);
    expect(cosine(q, f)).toBeLessThan(embedder.threshold);
  }, 120_000);
});
