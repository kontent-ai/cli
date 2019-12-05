import yargs from 'yargs';
import chalk from 'chalk';
import {
    getDuplicates,
    getMigrationFilepath,
    loadMigrationFiles,
    loadModule,
    runMigration
} from '../../utils/migrationUtils';
import { fileExists } from '../../utils/fileUtils';
import {
    environmentConfigExists,
    getEnvironmentsConfig
} from '../../utils/environmentUtils';
import { createManagementClient } from '../../managementClientFactory';

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
                        const fileName = args.name
                            .split('.js')
                            .slice(0, -1)
                            .join('.js');
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
        let { projectId } = argv;
        let { apiKey } = argv;
        const migrationName = argv.name;
        const runAll = argv.all;
        const debugMode = argv.debug;
        const { continueOnError } = argv;
        let migrationsResults: number = 0;

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

        if (runAll) {
            const migrations = await loadMigrationFiles();
            const sortedMigrations = migrations.sort(
                (migrationPrev, migrationNext) =>
                    migrationPrev.module.order - migrationNext.module.order
            );

            const duplicateMigrationsOrder = getDuplicates(
                sortedMigrations,
                t => t.module.order
            );
            if (duplicateMigrationsOrder.length > 0) {
                console.log('Duplicate migrations found:');
                duplicateMigrationsOrder.map(t => {
                    console.error(
                        chalk.red(
                            `Migration: ${t.name} order: ${t.module.order}`
                        )
                    );
                });

                process.exit(1);
            }

            const filteredMigrations = migrations.filter(String);

            if (filteredMigrations.length === 0) {
                console.log('No migrations found.');
            }

            let executedMigrationsCount = 0;
            for (const migration of filteredMigrations) {
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
                                `${executedMigrationsCount} of ${filteredMigrations.length} executed`
                            )
                        );
                        process.exit(1);
                    }

                    migrationsResults = 1;
                }
                executedMigrationsCount++;
            }
        } else {
            const migrationModule = await loadModule(`${migrationName}.js`);
            const migration = {
                name: migrationName,
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

// yargs needs exported command in exports object
Object.assign(exports, runMigrationCommand);
