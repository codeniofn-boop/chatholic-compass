/**
 * Local sentence embeddings via Transformers.js (the successor package of @xenova/transformers).
 * Model: all-MiniLM-L6-v2 (384 dimensions, mean pooling, L2-normalised), run on CPU with ONNX.
 *
 * Model files are loaded from EMBEDDING_MODEL_DIR when set (fully offline); otherwise they are
 * downloaded once from the Hugging Face Hub and cached under data/models/.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { MODELS_DIR } from "./paths";

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

async function loadExtractor(): Promise<Extractor> {
  const tf = await import("@huggingface/transformers");
  const localDir = process.env.EMBEDDING_MODEL_DIR
    ? path.resolve(process.env.EMBEDDING_MODEL_DIR)
    : existsSync(path.join(MODELS_DIR, EMBEDDING_MODEL, "config.json"))
      ? MODELS_DIR
      : null;
  if (localDir) {
    tf.env.localModelPath = localDir;
    tf.env.allowRemoteModels = false;
  } else {
    tf.env.cacheDir = MODELS_DIR;
  }
  tf.env.allowLocalModels = true;
  const pipe = await tf.pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" });
  return pipe as unknown as Extractor;
}

export function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) extractorPromise = loadExtractor();
  return extractorPromise;
}

/** Embed a batch of texts. Returns one Float32Array (length 384, unit norm) per text. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  return out.tolist().map((v) => Float32Array.from(v));
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const [v] = await embedTexts([text]);
  return v;
}
