import { ManagementClient } from '@kentico/kontent-management';
import { HttpService } from '@kentico/kontent-core';
import chalk from 'chalk';

interface ICreateManagementClientParams {
    readonly projectId: string;
    readonly apiKey: string;
    readonly debugMode: boolean;
}

export const createManagementClient = (
    params: ICreateManagementClientParams
): ManagementClient => {
    const httpService = new HttpService({
        requestInterceptor: config => {
            config.headers['X-KC-SOURCE'] = `@kentico/kontent-cli;0.0.1`;

            if (params.debugMode) {
                console.group(chalk.bgMagenta('Request details:'));
                console.log(chalk.yellow('URL:'), config.url);
                console.log(chalk.yellow('Method:'), config.method);
                console.log(chalk.yellow('Body:'), config.data);
                console.groupEnd();
            }
            return config;
        },
        responseInterceptor: config => {
            if (params.debugMode) {
                console.group(chalk.bgMagenta('Response details:'));
                console.error(chalk.yellow('Body:'), config.data);
                console.groupEnd();
            }

            return config;
        }
    });

    return new ManagementClient({
        httpService: httpService,
        projectId: params.projectId,
        apiKey: params.apiKey,
        isDeveloperMode: false
    });
};
