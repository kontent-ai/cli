import { ManagementClient } from '@kontent-ai/management-sdk';
import { HttpService } from '@kontent-ai/core-sdk';
const packageInfo = require('../package.json');
import * as dotEnv from 'dotenv';

interface ICreateManagementClientParams {
    readonly projectId: string;
    readonly apiKey: string;
    readonly logHttpServiceErrorsToConsole: boolean;
}

const retryAbleCodes = [429, 503];

dotEnv.config();

export const createManagementClient = (params: ICreateManagementClientParams): ManagementClient => {
    const httpService = new HttpService({
        logErrorsToConsole: params.logHttpServiceErrorsToConsole,
        axiosRequestConfig: {
            headers: {
                'X-KC-SOURCE': `${packageInfo.name};${packageInfo.version}`,
            },
        },
    });

    return new ManagementClient({
        httpService: httpService,
        projectId: params.projectId,
        apiKey: params.apiKey,
        baseUrl: process.env.BASE_URL,
        retryStrategy: {
            addJitter: true,
            deltaBackoffMs: 1000,
            maxAttempts: 10,
            canRetryError: (error: any) => {
                const timeout = error.errno === 'ETIMEDOUT';
                return timeout || (error.response && retryAbleCodes.includes(error.response.status));
            },
        },
    });
};
