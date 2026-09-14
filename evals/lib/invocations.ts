import * as z from "zod/mini";

// One line of the shim's log (evals/shim.ts): the CLI process's exit code and argv, key already redacted.
const CliInvocationSchema = z.object({ exitCode: z.int(), args: z.array(z.string()) });
export type CliInvocation = z.infer<typeof CliInvocationSchema>;

export type InvocationCounts = Readonly<{
  cliInvocationCount: number;
  failedCliInvocationCount: number;
  helpLookupCount: number;
  docsLookupCount: number;
}>;

export const parseInvocationLog = (log: string): ReadonlyArray<CliInvocation> =>
  log.split("\n").flatMap(parseLine);

export const countInvocations = (invocations: ReadonlyArray<CliInvocation>): InvocationCounts => ({
  cliInvocationCount: invocations.length,
  failedCliInvocationCount: invocations.filter((invocation) => invocation.exitCode !== 0).length,
  helpLookupCount: invocations.filter(isHelpLookup).length,
  docsLookupCount: invocations.filter(isDocsLookup).length,
});

const parseLine = (line: string): ReadonlyArray<CliInvocation> => {
  if (line === "") {
    return [];
  }
  const parsed = z.safeParse(CliInvocationSchema, tryParseJson(line));
  return parsed.success ? [parsed.data] : [];
};

const tryParseJson = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

const isHelpLookup = (invocation: CliInvocation): boolean =>
  invocation.args.includes("--help") || invocation.args.includes("-h");

const isDocsLookup = (invocation: CliInvocation): boolean => invocation.args[0] === "docs";
