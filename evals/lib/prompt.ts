export type BuildTaskPromptParams = Readonly<{
  envId: string;
  workspaceDir: string;
  taskPrompt: string;
}>;

export const buildPreamble = (envId: string, workspaceDir: string): string =>
  [
    `You are working with a Kontent.ai environment. Its id is ${envId}.`,
    "A Management API key for it is in the environment variable EVALS_MAPI_KEY. Never print, echo or paste it anywhere.",
    "The `kontent` CLI is installed and on PATH. Use it for everything you do with Kontent.ai.",
    `Work only inside ${workspaceDir}. You are forbidden to read, search, list or open any file or directory outside it, including source code, configuration and home directories on this machine. This includes commands like cat, ls, find, grep on other paths.`,
    `Any file you create - request bodies, scratch files, notes - must also live inside ${workspaceDir}. Do not use /tmp or your home directory.`,
    "When finished, reply with: every command you ran in order, what was unclear or annoying, and anything you had to guess.",
  ].join("\n");

export const buildTaskPrompt = ({
  envId,
  workspaceDir,
  taskPrompt,
}: BuildTaskPromptParams): string => `${buildPreamble(envId, workspaceDir)}\n\n${taskPrompt}`;
