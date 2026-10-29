import {
  confirm as clackConfirm,
  intro as clackIntro,
  note as clackNote,
  outro as clackOutro,
  select as clackSelect,
  spinner as clackSpinner,
  isCancel,
} from "@clack/prompts";
import { none, type Option, some } from "../../../core/lib/option.js";

export type Spinner = Readonly<{
  start: (message: string) => void;
  stop: (message: string) => void;
  error: (message: string) => void;
}>;

export type SelectOption = Readonly<{ value: string; label: string }>;

/** The interactive terminal UI; an answer is `none` when the user cancels. */
export type Prompts = Readonly<{
  intro: (title: string) => void;
  outro: (message: string) => void;
  note: (message: string, title: string) => void;
  spinner: () => Spinner;
  confirm: (
    options: Readonly<{ message: string; initialValue?: boolean }>,
  ) => Promise<Option<boolean>>;
  select: (
    options: Readonly<{ message: string; options: ReadonlyArray<SelectOption> }>,
  ) => Promise<Option<string>>;
}>;

/**
 * clack defaults every prompt, spinner and note to stdout, which stdout must
 * stay free of; there is no global setting for it, so the stderr stream is
 * bound here once instead of at every call site. As a side effect the spinner
 * keeps animating when stdout is piped, because clack's TTY check reads the
 * stream it is handed.
 *
 * `stream.message/info/success` hardcode stdout and cannot be redirected - do
 * not start using them.
 */
export const prompts: Prompts = {
  intro: (title) => clackIntro(title, { output: process.stderr }),
  outro: (message) => clackOutro(message, { output: process.stderr }),
  note: (message, title) => clackNote(message, title, { output: process.stderr }),
  spinner: () => clackSpinner({ output: process.stderr }),
  confirm: async (options) => answerOf(await clackConfirm({ ...options, output: process.stderr })),
  select: async (options) =>
    answerOf(
      await clackSelect<string>({
        message: options.message,
        options: [...options.options],
        output: process.stderr,
      }),
    ),
};

const answerOf = <T>(value: T | symbol): Option<T> => (isCancel(value) ? none : some(value));
