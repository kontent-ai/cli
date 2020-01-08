import yargs from 'yargs';
import chalk from 'chalk';
import {
    getDuplicates,
    getExecutedMigrations,
    getMigrationFilepath,
    loadMigrationFiles,
    loadModule,
    runMigration
} from '../../utils/migrationUtils';
import {
    fileExists,
    getFileWithExtension,
    isAllowedExtension
} from '../../utils/fileUtils';
import {
    environmentConfigExists,
    getEnvironmentsConfig
} from '../../utils/environmentUtils';
import { createManagementClient } from '../../managementClientFactory';
import { loadMigrationsExecutionStatus } from '../../utils/statusManager';
import { IMigration } from '../../models/migration';

const runMigrationCommand: yargs.CommandModule = {
    command: 'run',
    describe:
        'Runs a migration script specified by its name, or runs multiple migration scripts in the specified order.',
    builder: (yargs: any) =>
        yargs
            .options({
                name: {
                    alias: 'n',
                    describe: 'Migration name',
                    type: 'string'
                },
                'project-id': {
                    alias: 'p',
                    describe: 'Project ID to run the migration script on',
                    type: 'string'
                },
                'api-key': {
                    alias: 'k',
                    describe: 'Management API key',
                    type: 'string'
                },
                environment: {
                    alias: 'e',
                    describe: 'Environment name',
                    type: 'string'
                },
                all: {
                    alias: 'a',
                    describe:
                        'Run all migration scripts in the specified order',
                    type: 'boolean'
                },
                force: {
                    alias: 'f',
                    describe: 'Enforces run of already executed scripts.',
                    type: 'boolean',
                    default: false
                },
                'continue-on-error': {
                    alias: 'c',
                    describe:
                        'Continue executing migration scripts even if a migration script fails.',
                    default: false,
                    type: 'boolean'
                },
                debug: {
                    alias: 'd',
                    describe: 'Run in debug mode',
                    default: false,
                    type: 'boolean'
                }
            })
            .conflicts('all', 'name')
            .conflicts('environment', 'api-key')
            .conflicts('environment', 'project-id')
            .check((args: any) => {
                if (!args.environment && !(args.projectId && args.apiKey)) {
                    throw new Error(
                        chalk.red(
                            'Specify an environment or a project ID with its Management API key.'
                        )
                    );
                }

                if (!args.all) {
                    if (args.name) {
                        if (!isAllowedExtension(args.name)) {
                            throw new Error(
                                chalk.red(
                                    `File ${args.name} has not supported extension.`
                                )
                            );
                        }
                        const fileName = getFileWithExtension(args.name);
                        const migrationFilePath = getMigrationFilepath(
                            fileName
                        );
                        if (!fileExists(migrationFilePath)) {
                            throw new Error(
                                chalk.red(
                                    `Cannot find the specified migration script: ${migrationFilePath}.`
                                )
                            );
                        }
                    } else {
                        throw new Error(
                            chalk.red(
                                'Either the migration script name or all migration options needs to be specified.'
                            )
                        );
                    }
                }

                if (args.environment) {
                    if (!environmentConfigExists()) {
                        throw new Error(
                            chalk.red(
                                `Cannot find the environment configuration file. Add an environment named \"${args.environment}\" first.`
                            )
                        );
                    }

                    const environments = getEnvironmentsConfig();

                    if (!environments[args.environment]) {
                        throw new Error(
                            chalk.red(
                                `Cannot find the \"${args.environment}\" environment.`
                            )
                        );
                    }
                }

                return true;
            }),
    handler: async (argv: any): Promise<void> => {
        let projectId = argv.projectId;
        let apiKey = argv.apiKey;
        const migrationName = argv.name;
        const runAll = argv.all;
        const debugMode = argv.debug;
        const continueOnError = argv.continueOnError;
        let migrationsResults: number = 0;
        const runForce = argv.force;

        if (argv.environment) {
            const environments = getEnvironmentsConfig();

            projectId =
                environments[argv.environment].projectId || argv.projectId;
            apiKey = environments[argv.environment].apiKey || argv.apiKey;
        }

        const apiClient = createManagementClient({
            projectId,
            apiKey,
            debugMode
        });

        loadMigrationsExecutionStatus();

        if (runAll) {
            let migrationsToRun = (await loadMigrationFiles()).sort(
                (migrationPrev, migrationNext) =>
                    migrationPrev.module.order - migrationNext.module.order
            );

            checkForDuplicates(migrationsToRun);

            if (runForce) {
                console.log('Skipping to check already executed migrations');
            } else {
                migrationsToRun = skipExecutedMigrations(
                    migrationsToRun,
                    projectId
                );
            }

            if (migrationsToRun.length === 0) {
                console.log('No migrations to run.');
            }

            let executedMigrationsCount = 0;
            for (const migration of migrationsToRun) {
                const migrationResult = await runMigration(
                    migration,
                    apiClient,
                    projectId,
                    debugMode
                );

                if (migrationResult > 0) {
                    if (!continueOnError) {
                        console.error(
                            chalk.red(
                                `Execution of the \"${migration.name}\" migration was not successful, stopping...`
                            )
                        );
                        console.error(
                            chalk.red(
                                `${executedMigrationsCount} of ${migrationsToRun.length} executed`
                            )
                        );
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
                module: migrationModule
            };

            migrationsResults = await runMigration(
                migration,
                apiClient,
                projectId,
                debugMode
            );
        }

        process.exit(migrationsResults);
    }
};

const checkForDuplicates = (migrationsToRun: IMigration[]): void => {
    const duplicateMigrationsOrder = getDuplicates(
        migrationsToRun,
        t => t.module.order
    );

    if (duplicateMigrationsOrder.length > 0) {
        console.log('Duplicate migrations found:');
        duplicateMigrationsOrder.map(t =>
            console.error(
                chalk.red(`Migration: ${t.name} order: ${t.module.order}`)
            )
        );

        process.exit(1);
    }
};

const skipExecutedMigrations = (
    migrations: IMigration[],
    projectId: string
): IMigration[] => {
    const executedMigrations = getExecutedMigrations(migrations, projectId);
    const result: IMigration[] = [];

    for (const migration of migrations) {
        if (executedMigrations.some(em => em.name === migration.name)) {
            console.log(
                `Skipping already executed migration ${migration.name}`
            );
        } else {
            result.push(migration);
        }
    }

    return result;
};

// yargs needs exported command in exports object
Object.assign(exports, runMigrationCommand);
