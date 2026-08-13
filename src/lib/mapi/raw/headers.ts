import type { Header } from "@kontent-ai/core-sdk";
import { err, flatMap, map, ok, type Result } from "../../result.js";

/**
 * Parses repeated `Name: value` command-line entries. Fails on the first malformed
 * entry so a typo never reaches the API as a silently dropped header.
 */
export const parseHeaders = (raw: ReadonlyArray<string>): Result<ReadonlyArray<Header>, string> =>
  raw.reduce<Result<ReadonlyArray<Header>, string>>(
    (acc, entry) =>
      flatMap(acc, (headers) =>
        map(parseHeader(entry), (header) => [...headers, header] as ReadonlyArray<Header>),
      ),
    ok([]),
  );

// RFC 9110 token characters.
const headerNamePattern = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;

const parseHeader = (entry: string): Result<Header, string> => {
  const separatorIndex = entry.indexOf(":");
  const name = separatorIndex > 0 ? entry.slice(0, separatorIndex).trim() : "";

  if (!headerNamePattern.test(name)) {
    return err(`Invalid header "${entry}". Expected the "Name: value" format.`);
  }

  return ok({ name, value: entry.slice(separatorIndex + 1).trim() });
};
