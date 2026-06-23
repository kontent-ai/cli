import { match } from "ts-pattern";

type BaseSample = Readonly<{
  templateRepo: string; // giget spec
  envTemplateFile: string;
  envIdVarName: string;
  apiKeyVarName: string;
  hasPreviewSpace?: boolean;
}>;

export type SampleApp =
  | (BaseSample & { readonly projectType: "Kickstart" })
  | (BaseSample & { readonly projectType: "Karma" })
  | (BaseSample & {
      readonly projectType: "Ficto";
      readonly collectionVarName: string;
      readonly collection: string;
    });

const SAMPLES: readonly SampleApp[] = [
  {
    projectType: "Kickstart",
    templateRepo: "github:kontent-ai/kickstart-react-app",
    envTemplateFile: ".env.template",
    envIdVarName: "VITE_ENVIRONMENT_ID",
    apiKeyVarName: "VITE_DELIVERY_API_KEY",
  },
  {
    projectType: "Karma",
    templateRepo: "github:kontent-ai/karma-nextjs-app",
    envTemplateFile: ".env.template",
    envIdVarName: "KONTENT_ENVIRONMENT_ID",
    apiKeyVarName: "KONTENT_DELIVERY_API_KEY",
    hasPreviewSpace: true,
  },
  {
    projectType: "Ficto",
    templateRepo: "github:kontent-ai/sample-app-next-js",
    envTemplateFile: ".env.local.template",
    envIdVarName: "NEXT_PUBLIC_KONTENT_ENVIRONMENT_ID",
    apiKeyVarName: "KONTENT_PREVIEW_API_KEY",
    collectionVarName: "NEXT_PUBLIC_KONTENT_COLLECTION_CODENAME",
    collection: "ficto_healthtech",
  },
];

export const findSample = (projectType: string | undefined): SampleApp | undefined =>
  SAMPLES.find((sample) => sample.projectType === projectType);

export const supportedProjectTypes = SAMPLES.map((sample) => sample.projectType).join(", ");

export const buildEnvValues = (
  sample: SampleApp,
  envId: string,
  apiKey: string,
): Record<string, string> =>
  match(sample)
    .with({ projectType: "Ficto" }, (s) => ({
      [s.envIdVarName]: envId,
      [s.apiKeyVarName]: apiKey,
      [s.collectionVarName]: s.collection,
    }))
    .otherwise((s) => ({ [s.envIdVarName]: envId, [s.apiKeyVarName]: apiKey }));
