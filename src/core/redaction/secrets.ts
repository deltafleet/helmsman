import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface RedactionResult {
  text: string;
  applied: boolean;
  reasonCodes: string[];
}

export interface SecretFinding {
  path: string;
  reasonCode: string;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, "openai_style_api_key"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/g, "bearer_header"],
  [/"(?:access_token|refresh_token|api_key|secret)"\s*:\s*"[^"]+"/gi, "credential_json_field"],
  [/\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY)=[^\s]+/g, "credential_env_value"],
];

export function redactText(input: string): RedactionResult {
  let text = input;
  const reasonCodes = new Set<string>();
  for (const [pattern, code] of SECRET_PATTERNS) {
    text = text.replace(pattern, () => {
      reasonCodes.add(code);
      return "[REDACTED]";
    });
  }
  return { text, applied: reasonCodes.size > 0, reasonCodes: [...reasonCodes] };
}

export function safeSummary(value: unknown, maxLength = 1200): RedactionResult {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const redacted = redactText(raw);
  if (redacted.text.length <= maxLength) return redacted;
  return {
    text: `${redacted.text.slice(0, maxLength)}...[truncated]`,
    applied: true,
    reasonCodes: [...new Set([...redacted.reasonCodes, "truncated"])],
  };
}

export async function scanForSecrets(root: string): Promise<SecretFinding[]> {
  const findings: SecretFinding[] = [];

  async function walk(path: string): Promise<void> {
    const info = await stat(path);
    if (info.isDirectory()) {
      for (const entry of await readdir(path)) {
        await walk(join(path, entry));
      }
      return;
    }
    if (info.size > 1_000_000) return;
    const text = await readFile(path, "utf8").catch(() => "");
    for (const [pattern, code] of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) findings.push({ path, reasonCode: code });
    }
  }

  await walk(root);
  return findings;
}
