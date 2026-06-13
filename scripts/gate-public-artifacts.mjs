#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

// Files / directories scanned for public-artifact leaks. collectFiles() guards
// existence, so naming a not-yet-created dir (e.g. examples) is harmless.
const scanDirs = ["CLAUDE.md", "README.md", "docs", "scripts", "examples"];

// Files that legitimately contain the gate's own pattern vocabulary (framework
// words, handle names). They are scanned for credentials only — never for the
// residue patterns that would otherwise match their pattern tables.
const selfAllowlist = new Set([
  path.join("docs", "publication-gate.md"),
  path.join("scripts", "gate-public-artifacts.mjs"),
  path.join("scripts", "gate-allow.txt"),
]);

// Safe substrings: a line containing any of these is skipped. The commit
// identity the repo ships under is an email, so it is allowed by default.
const builtinAllow = ["123671200+diangao@users.noreply.github.com"];

function loadAllowlist() {
  const allow = [...builtinAllow];
  const f = path.join(root, "scripts", "gate-allow.txt");
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) allow.push(t);
    }
  }
  return allow;
}

// Credentials — flagged in every file (including self-allowlisted ones) and
// redacted in output so the gate never reprints a live secret.
const credentialPatterns = [
  { name: "anthropic/openai key", re: /\bsk-(?:ant|proj|live|test)?[A-Za-z0-9_-]{16,}\b/ },
  { name: "agent token", re: /\bsk_agent_[A-Za-z0-9]{8,}\b/ },
  { name: "machine key", re: /\bsk_machine_[A-Za-z0-9]{8,}\b/ },
  { name: "gateway token", re: /\bGW_API_TOKEN\b/i },
  { name: "viewer key header", re: /\bx-viewer-key\b/i },
  { name: "bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/ },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { name: "api key assignment", re: /\b(?:API_KEY|TOKEN|SECRET|PASSWORD|VIEWER_KEY)\s*[:=]\s*['"]?[^'"\s]{8,}/i },
  // Bounded so a 40-char git SHA (40 != 32 and 40 != 64) does not false-trip.
  { name: "hex-32 token", re: /(?<![A-Fa-f0-9])[A-Fa-f0-9]{32}(?![A-Fa-f0-9])/ },
  { name: "hex-64 token", re: /(?<![A-Fa-f0-9])[A-Fa-f0-9]{64}(?![A-Fa-f0-9])/ },
  { name: "private email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
];

// Harness residue — the strongest tells that an artifact came out of the agent
// framework. Applied to non-self-allowlisted files; printed in full so the
// author can locate and rewrite the source.
const residuePatterns = [
  { name: "framework name", re: /\b(?:slock|raft)\b/i },
  { name: "auto-memory marker", re: /\bauto-memory\b/i },
  { name: "raft cli marker", re: /\braft cli\b/i },
  { name: "message-header marker", re: /target=#|type=(?:agent|human|system)\]/ },
  {
    name: "private channel",
    re: /#(?:thinkos|personal-artifact|每日出摊|每日最重要|退思集|research-backlog|creative-projects|brainstorm|cool-people|tool-box|rando|side)\b/,
  },
  {
    name: "agent @mention",
    re: /@(?:mythos|fable|ryo|cindy|dozy|codex|john|jett|kimi|charlwin|angela)(?:[-_][A-Za-z0-9]+)*\b/i,
  },
  { name: "agent @mention (cjk)", re: /@?(?:珈奕加一|卡卡)/ },
  // Bare handles, but only the distinctive ones unlikely to occur as ordinary
  // English/proper-name prose. Common-name personas are caught via @mention.
  { name: "distinctive agent handle", re: /\b(?:mythos|dozy|jett|kimi|charlwin)\b/i },
  {
    name: "private project marker",
    re: /\b(?:Paperboy|ThinkOS-mein|jiayi-wisdom|proactive-jiayi|grind-window)\b/i,
  },
];

function redact(s) {
  if (s.length <= 8) return s[0] + "…";
  return s.slice(0, 4) + "…" + s.slice(-2);
}

function collectFiles(entry) {
  const abs = path.join(root, entry);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [abs];
  const out = [];
  for (const child of fs.readdirSync(abs)) {
    const childAbs = path.join(abs, child);
    if (fs.statSync(childAbs).isDirectory()) {
      out.push(...collectFiles(path.relative(root, childAbs)));
    } else {
      out.push(childAbs);
    }
  }
  return out;
}

// A raw harness transcript must never be committed, whatever its contents.
function findTranscripts(dir) {
  const out = [];
  for (const child of fs.readdirSync(dir)) {
    if (child === ".git" || child === "node_modules") continue;
    const abs = path.join(dir, child);
    if (fs.statSync(abs).isDirectory()) out.push(...findTranscripts(abs));
    else if (child.endsWith(".jsonl")) out.push(abs);
  }
  return out;
}

const allow = loadAllowlist();
const findings = [];

function scanFile(file) {
  const rel = path.relative(root, file);
  const isSelf = selfAllowlist.has(rel);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (allow.some((a) => line.includes(a))) continue;
    for (const p of credentialPatterns) {
      const m = line.match(p.re);
      if (m) findings.push({ file: rel, line: i + 1, type: p.name, value: redact(m[0]) });
    }
    if (isSelf) continue;
    for (const p of residuePatterns) {
      const m = line.match(p.re);
      if (m) findings.push({ file: rel, line: i + 1, type: p.name, value: m[0] });
    }
  }
}

const scanned = scanDirs.flatMap(collectFiles);
for (const file of scanned) scanFile(file);

for (const abs of findTranscripts(root)) {
  findings.push({ file: path.relative(root, abs), line: 0, type: "raw transcript (.jsonl)", value: "" });
}

if (findings.length > 0) {
  console.error("Public artifact gate failed:");
  for (const f of findings) {
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    console.error(`- ${where} [${f.type}]${f.value ? " " + f.value : ""}`);
  }
  process.exit(1);
}

console.log(`Public artifact gate passed (${scanned.length} files scanned).`);
