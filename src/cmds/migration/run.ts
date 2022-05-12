import yargs from 'yargs';
import chalk from 'chalk';
import { getDuplicates, getSuccessfullyExecutedMigrations, getMigrationFilepath, loadMigrationFiles, loadModule, runMigration, getMigrationsWithInvalidOrder } from '../../utils/migrationUtils';
import { fileExists, getFileWithExtension, isAllowedExtension } from '../../utils/fileUtils';
import { environmentConfigExists, getEnvironmentsConfig } from '../../utils/environmentUtils';
import { createManagementClient } from '../../managementClientFactory';
import { loadMigrationsExecutionStatus } from '../../utils/statusManager';
import { IMigration } from '../../models/migration';
import { IRange } from '../../models/range';

const runMigrationCommand: yargs.CommandModule = {
    command: 'run',
    describe: 'Runs a migration script specified by its name, or runs multiple migration scripts in the specified order.',
    builder: (yargs: any) =>
        yargs
            .options({
                name: {
                    alias: 'n',
                    describe: 'Migration name',
                    type: 'string',
                },
                'project-id': {
                    alias: 'p',
                    describe: 'Project ID to run the migration script on',
                    type: 'string',
                },
                'api-key': {
                    alias: 'k',
                    describe: 'Management API key',
                    type: 'string',
                },
                environment: {
                    alias: 'e',
                    describe: 'Environment name',
                    type: 'string',
                },
                all: {
                    alias: 'a',
                    describe: 'Run all migration scripts in the specified order',
                    type: 'boolean',
                },
                range: {
                    alias: 'r',
                    describe: 'Run all migration scripts in the specified range, eg.: 3:5 will run migrations with the "order" property set to 3, 4 and 5',
                    type: 'string',
                },
                force: {
                    alias: 'f',
                    describe: 'Enforces run of already executed scripts.',
                    type: 'boolean',
                    default: false,
                },
                'continue-on-error': {
                    alias: 'c',
                    describe: 'Continue executing migration scripts even if a migration script fails.',
                    default: false,
                    type: 'boolean',
                },
                debug: {
                    alias: 'd',
                    describe: 'Run in debug mode',
                    default: false,
                    type: 'boolean',
                },
            })
            .conflicts('all', 'name')
            .conflicts('range', 'name')
            .conflicts('all', 'range')
            .conflicts('environment', 'api-key')
            .conflicts('environment', 'project-id')
            .check((args: any) => {
                if (!args.environment && !(args.projectId && args.apiKey)) {
                    throw new Error(chalk.red('Specify an environment or a project ID with its Management API key.'));
                }

                if (!args.all) {
                    if (args.range) {
                        if (!getRange(args.range)) {
                            throw new Error(chalk.red(`The range has to be a string of a format "number:number" where the first number is less or equal to the second, eg.: "2:5".`));
                        }
                    } else if (args.name) {
                        if (!isAllowedExtension(args.name)) {
                            throw new Error(chalk.red(`File ${args.name} has not supported extension.`));
                        }
                        const fileName = getFileWithExtension(args.name);
                        const migrationFilePath = getMigrationFilepath(fileName);
                        if (!fileExists(migrationFilePath)) {
                            throw new Error(chalk.red(`Cannot find the specified migration script: ${migrationFilePath}.`));
                        }
                    } else {
                        throw new Error(chalk.red('Either the migration script name, range or all migration options needs to be specified.'));
                    }
                }

                if (args.environment) {
                    if (!environmentConfigExists()) {
                        throw new Error(chalk.red(`Cannot find the environment configuration file. Add an environment named \"${args.environment}\" first.`));
                    }

                    const environments = getEnvironmentsConfig();

                    if (!environments[args.environment]) {
                        throw new Error(chalk.red(`Cannot find the \"${args.environment}\" environment.`));
                    }
                }

                return true;
            }),
    handler: async (argv: any): Promise<void> => {
        let projectId = argv.projectId;
        let apiKey = argv.apiKey;
        const migrationName = argv.name;
        const runAll = argv.all;
        const runRange = getRange(argv.range);
        const debugMode = argv.debug;
        const continueOnError = argv.continueOnError;
        let migrationsResults: number = 0;
        const runForce = argv.force;

        if (argv.environment) {
            const environments = getEnvironmentsConfig();

            projectId = environments[argv.environment].projectId || argv.projectId;
            apiKey = environments[argv.environment].apiKey || argv.apiKey;
        }

        const apiClient = createManagementClient({
            projectId,
            apiKey,
            debugMode,
        });

        loadMigrationsExecutionStatus();

        if (runAll || runRange) {
            let migrationsToRun = await loadMigrationFiles();

            checkForDuplicates(migrationsToRun);
            checkForInvalidOrder(migrationsToRun);

            if (runRange) {
                migrationsToRun = getMigrationsByRange(migrationsToRun, runRange);
            }

            if (runForce) {
                console.log('Skipping to check already executed migrations');
            } else {
                migrationsToRun = skipExecutedMigrations(migrationsToRun, projectId);
            }

            if (migrationsToRun.length === 0) {
                console.log('No migrations to run.');
            }

            const sortedMigrationsToRun = migrationsToRun.sort((migrationPrev, migrationNext) => migrationPrev.module.order - migrationNext.module.order);
            let executedMigrationsCount = 0;
            for (const migration of sortedMigrationsToRun) {
                const migrationResult = await runMigration(migration, apiClient, projectId, debugMode);

                if (migrationResult > 0) {
                    if (!continueOnError) {
                        console.error(chalk.red(`Execution of the \"${migration.name}\" migration was not successful, stopping...`));
                        console.error(chalk.red(`${executedMigrationsCount} of ${migrationsToRun.length} executed`));
                        process.exit(1);
                    }
                    migrationsResults = 1;
                }

                executedMigrationsCount++;
            }
        } else {
            const fileName = getFileWithExtension(migrationName);
            const migrationModule = await loadModule(fileName);
            const migration = {
                name: fileName,
                module: migrationModule,
            };

            migrationsResults = await runMigration(migration, apiClient, projectId, debugMode);
        }

        process.exit(migrationsResults);
    },
};

export const getRange = (range: string): IRange | null => {
    const match = range.match(/^([0-9]+):([0-9]+)$/);
    if (!match) {
        return null;
    }
    const from = Number(match[1]);
    const to = Number(match[2]);

    return from <= to
        ? {
              from,
              to,
          }
        : null;
};

const checkForDuplicates = (migrationsToRun: IMigration[]): void => {
    const duplicateMigrationsOrder = getDuplicates(migrationsToRun, (migration) => migration.module.order);

    if (duplicateMigrationsOrder.length > 0) {
        console.log('Duplicate migrations found:');
        duplicateMigrationsOrder.map((migration) => console.error(chalk.red(`Migration: ${migration.name} order: ${migration.module.order}`)));

        process.exit(1);
    }
};

const getMigrationsByRange = (migrationsToRun: IMigration[], range: IRange): IMigration[] => {
    const migrations: IMigration[] = [];

    for (const migration of migrationsToRun) {
        if (migration.module.order >= range.from && migration.module.order <= range.to) {
            migrations.push(migration);
        }
    }

    return migrations.filter(String);
};

const checkForInvalidOrder = (migrationsToRun: IMigration[]): void => {
    const migrationsWithInvalidOrder: IMigration[] = getMigrationsWithInvalidOrder(migrationsToRun);

    if (migrationsWithInvalidOrder.length > 0) {
        console.log('Migration order has to be positive integer or zero:');
        migrationsWithInvalidOrder.map((migration) => console.error(chalk.red(`Migration: ${migration.name} order: ${migration.module.order}`)));

        process.exit(1);
    }
};

const skipExecutedMigrations = (migrations: IMigration[], projectId: string): IMigration[] => {
    const executedMigrations = getSuccessfullyExecutedMigrations(migrations, projectId);
    const result: IMigration[] = [];

    for (const migration of migrations) {
        if (executedMigrations.some((executedMigration) => executedMigration.name === migration.name)) {
            console.log(`Skipping already executed migration ${migration.name}`);
        } else {
            result.push(migration);
        }
    }

    return result;
};

// yargs needs exported command in exports object
Object.assign(exports, runMigrationCommand);
