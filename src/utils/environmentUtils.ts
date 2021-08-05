import chalk from 'chalk';
import fs from 'fs';
import * as path from 'path';
import { IEnvironmentsConfig } from '../models/environment';
import { fileExists } from './fileUtils';

const environmentsConfigName = '.environments.json';

export const saveEnvironmentConfig = (name: string, projectId: string, apiKey: string) => {
    const environments = getEnvironmentsConfig();
    if (environments[name]) {
        console.log(chalk.yellow(`The \"${name}\" environment already exists and will be overwritten.`));
    }

    environments[name] = { projectId, apiKey };
    const environmentsJSON = JSON.stringify(environments, null, 2);

    saveEnvironmentData(environmentsJSON, name);
};

const saveEnvironmentData = (data: string, name: string): void => {
    const configsFilepath = getEnvironmentConfigFilepath();

    fs.writeFile(configsFilepath, data, { flag: 'w' }, (error) => {
        if (error) {
            console.error(chalk.red(error.stack || error.message));
        } else {
            console.log(chalk.green(`The environment ${name} (\"${configsFilepath}\") was updated.`));
        }
    });
};

const getEnvironmentConfigFilepath = (): string => path.join(process.cwd(), environmentsConfigName);

export const getEnvironmentsConfig = (): IEnvironmentsConfig => {
    const environmentConfigFilepath = getEnvironmentConfigFilepath();

    if (!fileExists(environmentConfigFilepath)) {
        return {};
    }

    const environmentsBuffer = fs.readFileSync(environmentConfigFilepath);

    return JSON.parse(environmentsBuffer.toString());
};

export const environmentConfigExists = () => {
    const environmentConfigFilepath = getEnvironmentConfigFilepath();

    return fileExists(environmentConfigFilepath);
};
