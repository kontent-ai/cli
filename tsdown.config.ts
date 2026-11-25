import { defineConfig } from "tsdown";

// Pick up build-time variables (e.g. KONTENT_CLI_AMPLITUDE_API_KEY) from a
// local .env file; real environment variables take precedence.
try {
  process.loadEnvFile();
} catch {
  // no .env file present; fine
}

const RELEASE_REQUIRED_VARS = [
  "KONTENT_CLI_AMPLITUDE_API_KEY",
  "KONTENT_AUTH0_DOMAIN",
  "KONTENT_AUTH0_CLIENT_ID",
  "KONTENT_AUTH0_AUDIENCE",
] as const;

const isReleaseBuild = process.env.KONTENT_CLI_RELEASE_BUILD === "1";
const missingVars = RELEASE_REQUIRED_VARS.filter((name) => !process.env[name]);
if (isReleaseBuild && missingVars.length > 0) {
  throw new Error(`Release build is missing: ${missingVars.join(", ")}`);
}

export default defineConfig({
  entry: ["src/index.ts"],
  define: {
    __AMPLITUDE_API_KEY__: JSON.stringify(process.env.KONTENT_CLI_AMPLITUDE_API_KEY ?? ""),
    __KONTENT_URL__: JSON.stringify(process.env.KONTENT_URL ?? ""),
    __AUTH0_DOMAIN__: JSON.stringify(process.env.KONTENT_AUTH0_DOMAIN ?? ""),
    __AUTH0_CLIENT_ID__: JSON.stringify(process.env.KONTENT_AUTH0_CLIENT_ID ?? ""),
    __AUTH0_AUDIENCE__: JSON.stringify(process.env.KONTENT_AUTH0_AUDIENCE ?? ""),
  },
  format: "esm",
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  shims: false,
  dts: false,
  sourcemap: false,
  unbundle: false,
});
