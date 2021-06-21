import { ManagementClient } from '@kentico/kontent-management';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { listFiles } from './fileUtils';
import { TemplateType } from '../models/templateType';
import { MigrationModule } from '../types';
import { IMigration } from '../models/migration';
import { markAsCompleted, wasSuccessfullyExecuted } from './statusManager';

export const getMigrationDirectory = (): string => {
    const migrationDirectory = 'Migrations';
    return path.join(process.cwd(), migrationDirectory);
};

export const getMigrationFilepath = (filename: string): string => {
    return path.join(getMigrationDirectory(), filename);
};

const ensureMigrationsDirectoryExists = () => {
    const directory = getMigrationDirectory();
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
    }
};

export const saveMigrationFile = (migrationName: string, migrationData: string, templateType: TemplateType): string => {
    ensureMigrationsDirectoryExists();
    const fileExtension = templateType === TemplateType.TypeScript ? '.ts' : '.js';
    const migrationFilepath = getMigrationFilepath(migrationName + fileExtension);

    try {
        fs.writeFileSync(migrationFilepath, migrationData);
        console.log(chalk.green(`Migration template ${migrationName} (${migrationFilepath}) was generated.`));
    } catch (e) {
        console.error(`Couldn't save the migration.`, e.message);
    }

    return migrationFilepath;
};

export const runMigration = async (migration: IMigration, client: ManagementClient, projectId: string, debugMode: boolean = false): Promise<number> => {
    console.log(`Running the ${migration.name} migration.`);

    let isSuccess = true;

    try {
        await migration.module.run(client).then(() => {
            markAsCompleted(projectId, migration.name, migration.module.order);
        });
    } catch (e) {
        console.error(chalk.redBright('An error occurred while running migration:'), chalk.yellowBright(migration.name), chalk.redBright('see the output from running the script.'));

        if (e.originalError !== undefined) {
            console.group('Error details');
            console.error(chalk.redBright('Message:'), e.message);
            console.error(chalk.redBright('Code:'), e.errorCode);
            console.error(chalk.redBright('Validation Errors:'), e.validationErrors);
            console.groupEnd();

            if (debugMode) {
                const requestConfig = e.originalError.config;
                const bodyData = JSON.parse(requestConfig.data || {});

                console.log();
                console.group('Request details:');
                console.error(chalk.yellow('URL:'), requestConfig.url);
                console.error(chalk.yellow('Method:'), requestConfig.method);
                console.error(chalk.yellow('Body:'), bodyData);
                console.groupEnd();
                console.log();
                console.group('Response details:');
                console.error(chalk.yellow('Message:'), e.originalError.message);
                console.groupEnd();
            }
        } else {
            console.error(chalk.redBright('Message:'), e.message);
        }

        isSuccess = false;
    }

    if (!isSuccess) {
        return 1;
    }

    console.log(chalk.green(`The \"${migration.name}\" migration on a project with ID \"${projectId}\" executed successfully.`));
    return 0;
};

export const generateTypedMigration = (): string => {
    return `import {MigrationModule} from "@kentico/kontent-cli";

const migration: MigrationModule = {
    order: 1,
    run: async (apiClient) => {
    },
};

export default migration;
`;
};

export const generatePlainMigration = (): string => {
    return `
const migration = {
    order: 1,
    run: async (apiClient) => {
    },
};

module.exports = migration;
`;
};

export const createMigration = (migrationName: string, templateType: TemplateType): string => {
    ensureMigrationsDirectoryExists();
    const generatedMigration = templateType === TemplateType.TypeScript ? generateTypedMigration() : generatePlainMigration();

    return saveMigrationFile(migrationName, generatedMigration, templateType);
};

export const getDuplicates = <T extends any, K extends keyof T>(array: T[], key: K | ((obj: T) => string | number)): T[] => {
    const keyFn = key instanceof Function ? key : (obj: T) => obj[key];
    const allEntries = new Map<number, T[]>();
    let duplicates: T[] = [];

    for (const item of array) {
        const itemKey = keyFn(item);
        const prevItem = allEntries.get(itemKey) || [];
        allEntries.set(itemKey, prevItem.concat(item));
    }

    for (const [, value] of allEntries.entries()) {
        if (value.length > 1) {
            duplicates = duplicates.concat(value);
        }
    }

    return duplicates;
};

export const loadModule = async (migrationFile: string): Promise<MigrationModule> => {
    const migrationPath = getMigrationFilepath(migrationFile);

    return await import(migrationPath)
        .then(async (module) => {
            const importedModule: MigrationModule = module.default;
            return importedModule;
        })
        .catch((error) => {
            throw new Error(chalk.red(`Couldn't import the migration script from \"${migrationPath}"\ due to an error: \"${error.message}\".`));
        });
};

export const loadMigrationFiles = async (): Promise<IMigration[]> => {
    const migrations: IMigration[] = [];

    const files = listFiles('.js');

    for (const file of files) {
        const migrationModule = await loadModule(file.name);

        migrations.push({ name: file.name, module: migrationModule });
    }

    return migrations.filter(String);
};

export const getSuccessfullyExecutedMigrations = (migrations: IMigration[], projectId: string): IMigration[] => {
    const alreadyExecutedMigrations: IMigration[] = [];

    // filter by execution status
    for (const migration of migrations) {
        if (wasSuccessfullyExecuted(migration.name, projectId)) {
            alreadyExecutedMigrations.push(migration);
        }
    }

    return alreadyExecutedMigrations.filter(String);
};
