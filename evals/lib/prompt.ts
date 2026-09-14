import { readFile } from "node:fs/promises";

export type BuildTaskPromptParams = Readonly<{
  preamble: string;
  envId: string;
  workspaceDir: string;
  taskPrompt: string;
}>;

export const readPreamble = (path: string): Promise<string> => readFile(path, "utf8");

export const buildTaskPrompt = ({
  preamble,
  envId,
  workspaceDir,
  taskPrompt,
}: BuildTaskPromptParams): string =>
  `${substitutePlaceholders(preamble, envId, workspaceDir)}\n\n${taskPrompt}`;

const substitutePlaceholders = (preamble: string, envId: string, workspaceDir: string): string =>
  preamble.replaceAll("{{ENV_ID}}", envId).replaceAll("{{WORKSPACE_DIR}}", workspaceDir);
