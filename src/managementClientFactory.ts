import { ManagementClient } from '@kentico/kontent-management';
import { HttpService } from '@kentico/kontent-core';
const packageInfo = require('../package.json');
import * as dotEnv from 'dotenv';

interface ICreateManagementClientParams {
    readonly projectId: string;
    readonly apiKey: string;
    readonly debugMode: boolean;
}

const retryAbleCodes = [429, 503];

dotEnv.config();

export const createManagementClient = (params: ICreateManagementClientParams): ManagementClient => {
    const httpService = new HttpService({
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
