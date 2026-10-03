/**
 * Tolerant JSON extraction for model replies. Free models often wrap JSON in prose or code
 * fences and occasionally emit invalid escapes (e.g. \' in Taglish contractions), trailing
 * commas, or raw newlines inside strings. Strict `JSON.parse` would throw away a good answer.
 */
export function extractJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model did not return JSON");
  const body = cleaned.slice(start, end + 1);

  const attempts: ((s: string) => string)[] = [
    (s) => s,
    // \' and any other escape JSON does not define -> drop the backslash
    (s) => s.replace(/\\(?!["\\/bfnrtu])/g, ""),
    // trailing commas before } or ]
    (s) => s.replace(/\\(?!["\\/bfnrtu])/g, "").replace(/,\s*([}\]])/g, "$1"),
    // raw control characters inside strings (literal newlines/tabs)
    (s) =>
      s
        .replace(/\\(?!["\\/bfnrtu])/g, "")
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001f]+/g, " "),
  ];

  let lastError: unknown;
  for (const fix of attempts) {
    try {
      return JSON.parse(fix(body));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Invalid JSON from model");
}
