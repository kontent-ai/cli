import { ManagementClient, SharedModels } from '@kontent-ai/management-sdk';
import chalk from 'chalk';
import path from 'path';
import fs, { Dirent } from 'fs';
import { TemplateType } from '../models/templateType';
import { MigrationModule } from '../types';
import { IMigration } from '../models/migration';
import { markAsCompleted, shouldSkipMigration } from './statusManager';
import { formatDateForFileName } from './dateUtils';
import { StatusPlugin } from './status/statusPlugin';
import { IStatus, Operation } from '../models/status';

const listMigrationFiles = (fileExtension: string): Dirent[] => {
    return fs
        .readdirSync(getMigrationDirectory(), { withFileTypes: true })
        .filter((f) => f.isFile())
        .filter((f) => f.name.endsWith(fileExtension));
};


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

export const saveMigrationFile = (migrationName: string, migrationData: string, templateType: TemplateType, orderDate: Date | null): string => {
    ensureMigrationsDirectoryExists();
    const fileExtension = templateType === TemplateType.TypeScript ? '.ts' : '.js';
    const date = orderDate ? `${formatDateForFileName(orderDate)}` : '';
    const migrationFilepath = getMigrationFilepath(date + migrationName + fileExtension);

    try {
        fs.writeFileSync(migrationFilepath, migrationData);
        console.log(chalk.green(`Migration template ${migrationName} (${migrationFilepath}) was generated.`));
    } catch (e) {
        console.error("Couldn't save the migration.", e instanceof Error ? e.message : 'Unknown error occurred.');
    }

    return migrationFilepath;
};

export const runMigration = async (
    migrationsStatus: IStatus,
    migration: IMigration,
    client: ManagementClient,
    projectId: string,
    operation: Operation
    , saveStatusFromPlugin: StatusPlugin['saveStatus'] | null): Promise<number> => {
    console.log(`Running the ${operation === 'rollback' && 'rollback of'} ${migration.name} migration.`);

    let isSuccess = true;

    try {
        if(operation === 'run') {
            await migration.module.run(client).then(async () => {
                await markAsCompleted(migrationsStatus, projectId, migration.name, migration.module.order, operation, saveStatusFromPlugin);
            });
        } else {
            if(migration.module.rollback === undefined) {
                throw new Error('No rollback function specified');
            }
            migration.module.rollback?.(client).then(async () => {
                await markAsCompleted(migrationsStatus, projectId, migration.name, migration.module.order, operation, saveStatusFromPlugin);
            });
        }
    } catch (e) {
        console.error(chalk.redBright('An error occurred while running migration:'), chalk.yellowBright(migration.name), chalk.redBright('see the output from running the script.'));

        let error = e as any;
        if (e instanceof SharedModels.ContentManagementBaseKontentError && e.originalError !== undefined) {
            console.group('Error details');
            console.error(chalk.redBright('Message:'), e.message);
            console.error(chalk.redBright('Code:'), e.errorCode);
            console.error(chalk.redBright('Validation Errors:'), e.validationErrors);
            console.groupEnd();
            console.log();
            console.group('Response details:');
            console.error(chalk.redBright('Message:'), e.originalError.message);
            console.groupEnd();

            error = e.originalError;
        } else {
            console.group('Error details');
            console.error(chalk.redBright('Message:'), e instanceof Error ? e.message : 'Unknown error');
            console.groupEnd();
        }

        const requestConfig = error.config;
        if (requestConfig) {
            const bodyData = JSON.parse(requestConfig.data || {});
            console.log();
            console.group('Request details:');
            console.error(chalk.yellow('URL:'), requestConfig.url);
            console.error(chalk.yellow('Method:'), requestConfig.method);
            console.error(chalk.yellow('Body:'), bodyData);
            console.groupEnd();
        }

        isSuccess = false;
    }

    if (!isSuccess) {
        return 1;
    }

    console.log(chalk.green(`The \"${migration.name}\" migration on a project with ID \"${projectId}\" executed successfully.`));
    return 0;
};

export const generateTypedMigration = (orderDate?: Date | null): string => {
    const order = orderDate ? `new Date('${orderDate.toISOString()}')` : '1';
    return `import {MigrationModule} from "@kontent-ai/cli";

const migration: MigrationModule = {
    order: ${order},
    run: async (apiClient) => {
    },
    rollback: async(apiClient) => {
    },
};

export default migration;
`;
};

export const generatePlainMigration = (orderDate?: Date | null): string => {
    const order = orderDate ? `new Date('${orderDate.toISOString()}')` : '1';

    return `
const migration = {
    order: ${order},
    run: async (apiClient) => {
    },
    rollback: async(apiClient) => {
    },
};

module.exports = migration;
`;
};

export const createMigration = (migrationName: string, templateType: TemplateType, useTimestampOrder: boolean): string => {
    ensureMigrationsDirectoryExists();
    const orderDate = true === useTimestampOrder ? new Date() : null;
    orderDate?.setMilliseconds(0);
    const generatedMigration = templateType === TemplateType.TypeScript ? generateTypedMigration(orderDate) : generatePlainMigration(orderDate);

    return saveMigrationFile(migrationName, generatedMigration, templateType, orderDate);
};

export const getDuplicates = <T extends any>(array: T[], key: (obj: T) => number | Date): T[] => {
    const allEntries = new Map<number | Date, T[]>();
    let duplicates: T[] = [];

    for (const item of array) {
        const itemKey = key(item);
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

export const getMigrationsWithInvalidOrder = <T extends { module: any }>(array: T[]): T[] => {
    const migrationsWithInvalidOrder: T[] = [];

    for (const migration of array) {
        if (migration.module.order instanceof Date) {
            continue;
        }

        if (!Number.isInteger(migration.module.order) || Number(migration.module.order) < 0) {
            migrationsWithInvalidOrder.push(migration);
        }
    }

    return migrationsWithInvalidOrder;
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

    const files = listMigrationFiles('.js');

    for (const file of files) {
        migrations.push({ name: file.name, module: await loadModule(file.name) });
    }

    return migrations.filter(String);
};

export const getSuccessfullyExecutedMigrations = (
    migrationsStatus: IStatus,
    migrations: IMigration[],
    projectId: string,
    operation: Operation
    ): IMigration[] => {
    const alreadyExecutedMigrations: IMigration[] = [];

    // filter by execution status
    for (const migration of migrations) {
        if (shouldSkipMigration(migrationsStatus, migration.name, projectId, operation)) {
            alreadyExecutedMigrations.push(migration);
        }
    }

    return alreadyExecutedMigrations.filter(String);
};
