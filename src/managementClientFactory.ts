import { ManagementClient } from '@kentico/kontent-management';
import { HttpService } from '@kentico/kontent-core';
import chalk from 'chalk';
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
    // TODO - verify whether to use custom implementation to be able to register axios interceptor just for logging
    const httpService = new HttpService({
        axiosRequestConfig: {
            headers: {
                'X-KC-SOURCE': `${packageInfo.name};${packageInfo.version}`,
            },
            transformRequest: (data: any, headers?: any) => {
                if (params.debugMode) {
                    console.group(chalk.bgCyan(chalk.yellowBright('Request details:')));
                    console.log(chalk.yellow('Headers:'), headers);
                    console.log(chalk.yellow('Body:'), data);
                    console.groupEnd();
                }
                return data;
            },
            transformResponse: (data: any, headers?: any) => {
                console.group(chalk.bgCyan(chalk.yellowBright('Response details:')));
                console.log(chalk.yellow('Headers:'), headers);
                console.log(chalk.yellow('Body:'), data);
                console.groupEnd();
                return data;
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
