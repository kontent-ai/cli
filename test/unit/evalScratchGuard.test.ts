import { describe, expect, it } from "vitest";
import { findDeniedToken, scratchDirSpellings } from "../../evals/lib/agent.js";

const scratch = "/var/folders/ab/kontent-eval-x";
const scratchDirs = scratchDirSpellings(scratch);

describe("findDeniedToken", () => {
  it.each([
    "kontent mapi GET /types",
    "kontent mapi GET types --mapiKey $EVALS_MAPI_KEY",
    "kontent --help > /dev/null 2>&1",
    `cat ${scratch}/body.json`,
    `cd /private${scratch} && ls`,
    "ls ./sub",
    "cat x > /dev/null",
    "echo a|grep b",
  ])("allows %s", (command) => {
    expect(findDeniedToken(command, scratchDirs)).toBeUndefined();
  });

  it.each([
    ["cat ~/.kontent/config.json", "~/.kontent/config.json"],
    ["ls $HOME/.claude", "$HOME/.claude"],
    ["cat /etc/passwd", "/etc/passwd"],
    ["cat /Users/someone/.zshrc", "/Users/someone/.zshrc"],
    [`cat ${scratch}/../other/secret`, `${scratch}/../other/secret`],
    ["cat ../secret", "../secret"],
    ["cat /var/folders/ab/other-dir/file", "/var/folders/ab/other-dir/file"],
    ['grep -r key "/Users/someone/src"', '"/Users/someone/src"'],
    ["ls /etc", "/etc"],
    ["cat /Users", "/Users"],
    [`echo \${HOME}`, `\${HOME}`],
    ["cat</etc/passwd", "/etc/passwd"],
    ["true;cat /etc/passwd", "/etc/passwd"],
    ["(cat /etc/passwd)", "/etc/passwd"],
  ])("denies %s", (command, expected) => {
    expect(findDeniedToken(command, scratchDirs)).toBe(expected);
  });
});

describe("scratchDirSpellings", () => {
  it("pairs the mkdtemp path with its /private twin", () => {
    expect(scratchDirSpellings("/var/x")).toEqual(["/var/x", "/private/var/x"]);
    expect(scratchDirSpellings("/private/var/x")).toEqual(["/private/var/x", "/var/x"]);
  });
});
