#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const scanDirs = ["CLAUDE.md", "README.md", "docs"];

const credentialPatterns = [
  { name: "OpenAI/Anthropic-style key", re: /\bsk-(?:ant|proj|agent|machine|live|test)?[A-Za-z0-9_-]{16,}\b/g },
  { name: "Bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/g },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { name: "API key assignment", re: /\b(?:API_KEY|TOKEN|SECRET|PASSWORD|VIEWER_KEY)\s*[:=]\s*['"]?[^'"\s]{8,}/gi },
  { name: "long hex token", re: /\b[a-f0-9]{48,}\b/gi },
  { name: "private email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi }
];

const privateResiduePatterns = [
  { name: "raw raft command", re: /\braft\s+(?:message|task|channel|attachment|reminder)\b/g },
  { name: "private Slock channel", re: /#(?:thinkos|personal-artifact|每日出摊|每日最重要|退思集|research-backlog|creative-projects|brainstorm|cool-people|tool-box|rando|side)\b/g },
  { name: "historical agent handle", re: /@(?:mythos|fable|Ryo|Cindy|dozy|codex|John-mac-mini|Dozy-Mac-mini|john|jett|kimi|Charlwin|珈奕加一)\b/g },
  { name: "private project marker", re: /\b(?:Paperboy|ThinkOS-mein|jiayi-wisdom|proactive-jiayi|grind-window)\b/g }
];

const selfAllowlist = new Set([
  path.join("docs", "publication-gate.md"),
  path.join("scripts", "gate-public-artifacts.mjs")
]);

function collectFiles(entry) {
  const abs = path.join(root, entry);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [abs];
  const files = [];
  for (const child of fs.readdirSync(abs)) {
    const childAbs = path.join(abs, child);
    const childStat = fs.statSync(childAbs);
    if (childStat.isDirectory()) {
      files.push(...collectFiles(path.relative(root, childAbs)));
    } else if (childStat.isFile()) {
      files.push(childAbs);
    }
  }
  return files;
}

const files = scanDirs.flatMap(collectFiles);
const findings = [];

for (const file of files) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  const patterns = selfAllowlist.has(rel)
    ? credentialPatterns
    : credentialPatterns.concat(privateResiduePatterns);

  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    for (const match of text.matchAll(pattern.re)) {
      const before = text.slice(0, match.index);
      const line = before.split("\n").length;
      findings.push({ file: rel, line, type: pattern.name, value: match[0] });
    }
  }
}

if (findings.length > 0) {
  console.error("Public artifact gate failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.type}: ${finding.value}`);
  }
  process.exit(1);
}

console.log(`Public artifact gate passed (${files.length} files scanned).`);

