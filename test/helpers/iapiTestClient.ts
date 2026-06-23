import { getDefaultHttpService, type HttpAdapter, type JsonValue } from "@kontent-ai/core-sdk";
import type { IapiClient } from "../../src/lib/iapi/client.js";

const testBaseUrl = { protocol: "https", host: "iapi.test" } as const;
const testSdkInfo = { name: "kontent-cli-test", version: "0.0.0", host: "npmjs.com" } as const;

export type IapiRoute = Readonly<{
  method: string;
  path: RegExp;
  reply: JsonValue;
}>;

// A real iapi client whose transport answers from a declarative route table. The fake
// plugs into core-sdk's HttpAdapter seam, so the genuine endpoint/query code runs against
// it. Reusable by any command's tests, not just bootstrap.
export const iapiTestClient = (routes: readonly IapiRoute[]): IapiClient => {
  const adapter: HttpAdapter = {
    executeRequest: ({ url, method }) => {
      const route = routes.find((r) => r.method === method && r.path.test(url.pathname));
      if (route === undefined) {
        throw new Error(`No iapi stub for ${method} ${url.pathname}`);
      }
      return Promise.resolve({
        payload: route.reply,
        responseHeaders: [],
        status: 200,
        statusText: "OK",
        url,
      });
    },
  };

  return {
    config: { baseUrl: testBaseUrl, httpService: getDefaultHttpService({ adapter }) },
    sdkInfo: testSdkInfo,
    urlBase: testBaseUrl,
    token: "test-token",
  };
};
