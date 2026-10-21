const keyOfLine = (line: string): string | null => {
  if (!line.includes("=")) {
    return null;
  }
  const [name = ""] = line.split("=");
  return name.trim();
};

/**
 * Fills a `.env`-style template with `values`: a `KEY=...` line whose key is in
 * `values` has its value replaced in place; comments, blank lines, and keys we
 * don't set are kept verbatim. Templates are the source of truth for which keys
 * exist, so a value whose key isn't in the template is simply ignored.
 */
export const applyEnvOverrides = (
  template: string,
  values: Readonly<Record<string, string>>,
): string =>
  template
    .split("\n")
    .map((line) => {
      const key = keyOfLine(line);
      return key !== null && Object.hasOwn(values, key) ? `${key}=${values[key]}` : line;
    })
    .join("\n");
