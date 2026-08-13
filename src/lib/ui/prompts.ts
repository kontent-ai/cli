import {
  confirm as clackConfirm,
  intro as clackIntro,
  note as clackNote,
  outro as clackOutro,
  select as clackSelect,
  spinner as clackSpinner,
} from "@clack/prompts";

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
export const spinner: typeof clackSpinner = (options = {}) =>
  clackSpinner({ output: process.stderr, ...options });

export const confirm: typeof clackConfirm = async (options) =>
  clackConfirm({ output: process.stderr, ...options });

export const select: typeof clackSelect = async (options) =>
  clackSelect({ output: process.stderr, ...options });

export const note: typeof clackNote = (message, title, options = {}) =>
  clackNote(message, title, { output: process.stderr, ...options });

export const intro: typeof clackIntro = (title, options = {}) =>
  clackIntro(title, { output: process.stderr, ...options });

export const outro: typeof clackOutro = (message, options = {}) =>
  clackOutro(message, { output: process.stderr, ...options });
