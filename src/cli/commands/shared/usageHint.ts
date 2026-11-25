// yargs knows which command it entered (`kontent mapi`, `kontent environment use`) only
// through internal methods missing from its typings. Each step is optional, so a yargs
// release that renames one points the hint at the root help instead of throwing.
type YargsInternals = Readonly<{
  getInternalMethods?: () => Readonly<{
    getContext?: () => Readonly<{ commands?: ReadonlyArray<string> }> | undefined;
  }>;
}>;

export const usageHint = (parser: object): string => {
  const commands = (parser as YargsInternals).getInternalMethods?.().getContext?.()?.commands ?? [];
  return `Run \`${["kontent", ...commands, "--help"].join(" ")}\` for usage.`;
};
