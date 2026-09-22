/**
 * Downloads the source texts into data/raw/ (gitignored). Nothing here is committed to git.
 *
 *  1. Catechism of the Catholic Church (English, paragraphs 1-2865 with hierarchy + footnotes)
 *     from the "Catholic Doctrine and Magisterium RAG Corpus" v1.0.0 release (AD IPSUM).
 *     The corpus metadata is CC0; the Catechism text itself remains © USCCB / Libreria
 *     Editrice Vaticana and is used here for private reference. See README "Licensing".
 *  2. The Catechism table of contents (heading tree) from nossbigg/catechism-ccc-json.
 *  3. The Douay-Rheims Bible (Challoner revision, public domain) in USFM from
 *     BibleCorps/ENG-B-DRC1750-pd-PSFM.
 *
 * Re-running is safe: files that already exist and match their checksum are kept.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { RAW_DIR } from "../lib/paths";

const CORPUS_URL =
  "https://github.com/GibbilyGooo/catholic-doctrine-magisterium-rag-corpus/releases/download/v1.0.0/Catholic_Doctrine_Magisterium_RAG_Corpus_v1.0.0.zip";
const CORPUS_SHA256 = "03b379edb545186890a5386252f1b540192847bb0f404883a4df7942ad7426c7";
const CORPUS_ZIP = path.join(RAW_DIR, "corpus-v1.0.0.zip");
export const CORPUS_DIR = path.join(RAW_DIR, "corpus");

const TOC_REPO = "https://github.com/nossbigg/catechism-ccc-json";
export const TOC_DIR = path.join(RAW_DIR, "catechism-ccc-json");

const DR_REPO = "https://github.com/BibleCorps/ENG-B-DRC1750-pd-PSFM";
export const DR_DIR = path.join(RAW_DIR, "douay-rheims-usfm");

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function download(url: string, dest: string): Promise<void> {
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`  saved ${dest} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}

function gitClone(repo: string, dest: string): void {
  if (existsSync(path.join(dest, ".git"))) {
    console.log(`Already cloned: ${dest}`);
    return;
  }
  console.log(`Cloning ${repo}`);
  execFileSync("git", ["clone", "--depth", "1", "--quiet", repo, dest], {
    stdio: "inherit",
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" },
  });
}

async function main(): Promise<void> {
  mkdirSync(RAW_DIR, { recursive: true });

  // 1. Catechism corpus (zip release, checksum-verified)
  if (!existsSync(CORPUS_ZIP) || sha256(CORPUS_ZIP) !== CORPUS_SHA256) {
    await download(CORPUS_URL, CORPUS_ZIP);
    const got = sha256(CORPUS_ZIP);
    if (got !== CORPUS_SHA256) {
      rmSync(CORPUS_ZIP);
      throw new Error(`Checksum mismatch for corpus zip: expected ${CORPUS_SHA256}, got ${got}`);
    }
  } else {
    console.log(`Corpus zip present and verified: ${CORPUS_ZIP}`);
  }
  const cccJsonl = path.join(CORPUS_DIR, "github-catholic-doctrine-magisterium-rag-corpus/source/canonical/catechism/CCC.jsonl");
  if (!existsSync(cccJsonl)) {
    mkdirSync(CORPUS_DIR, { recursive: true });
    console.log(`Extracting corpus to ${CORPUS_DIR}`);
    // Only the files the importer needs are extracted (the whole archive is ~120 MB).
    execFileSync(
      "unzip",
      [
        "-q",
        "-o",
        CORPUS_ZIP,
        "github-catholic-doctrine-magisterium-rag-corpus/source/canonical/catechism/*",
        "github-catholic-doctrine-magisterium-rag-corpus/source/derived/cross_reference_graph.json",
        "github-catholic-doctrine-magisterium-rag-corpus/source/provenance/source_catalog.json",
        "github-catholic-doctrine-magisterium-rag-corpus/LICENSE-DATA.md",
        "github-catholic-doctrine-magisterium-rag-corpus/COPYRIGHT_AND_SOURCES.md",
        "-d",
        CORPUS_DIR,
      ],
      { stdio: "inherit" },
    );
  } else {
    console.log(`Corpus already extracted: ${CORPUS_DIR}`);
  }

  // 2. Table of contents reference (heading tree)
  gitClone(TOC_REPO, TOC_DIR);

  // 3. Douay-Rheims USFM
  gitClone(DR_REPO, DR_DIR);

  console.log("\nSources ready under", RAW_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
