import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const textExtensions = new Set([
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".sql",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

const secretPatterns: Array<{ name: string; pattern: RegExp }> = [
  { name: "Hugging Face token", pattern: /\bhf_[A-Za-z0-9]{20,}\b/ },
  { name: "Groq token", pattern: /\bgsk_[A-Za-z0-9]{20,}\b/ },
  { name: "API token", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  {
    name: "credential-bearing database URL",
    pattern:
      /(?:postgres(?:ql)?(?:\+[a-zA-Z0-9_-]+)?|mongodb(?:\+srv)?):\/\/[^\s:/@]+:[^\s/@]+@/i,
  },
];

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
  encoding: "utf8",
  }
)
  .split("\0")
  .filter(Boolean);

const findings: string[] = [];

for (const file of trackedFiles) {
  const extension = path.extname(file).toLowerCase();
  if (!textExtensions.has(extension) && path.basename(file) !== ".env.example") {
    continue;
  }

  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  content.split(/\r?\n/).forEach((line, index) => {
    if (/<username>|your_[a-z0-9_]+_here/i.test(line)) {
      return;
    }

    for (const { name, pattern } of secretPatterns) {
      if (pattern.test(line)) {
        findings.push(`${file}:${index + 1} ${name}`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error("Potential committed secrets detected:");
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exitCode = 1;
} else {
  console.log("No credential-like values found in repository text files.");
}
