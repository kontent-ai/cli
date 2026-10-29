import { downloadTemplate } from "giget";
import { errorMessage } from "../../../core/lib/error.js";
import { type Result, tryAsync } from "../../../core/lib/result.js";

export type Templates = Readonly<{
  // `source` is a giget spec, e.g. "github:kontent-ai/kickstart-react-app".
  download: (source: string, targetDir: string) => Promise<Result<void, string>>;
}>;

export const templates: Templates = {
  download: async (source, targetDir) =>
    tryAsync(async () => {
      await downloadTemplate(source, { dir: targetDir, force: false });
    }, errorMessage),
};
