import yargs from 'yargs';
import chalk from 'chalk';
import { getDuplicates, getSuccessfullyExecutedMigrations, getMigrationFilepath, loadMigrationFiles, loadModule, runMigration, getMigrationsWithInvalidOrder } from '../../utils/migrationUtils';
import { fileExists, getFileWithExtension, isAllowedExtension } from '../../utils/fileUtils';
import { environmentConfigExists, getEnvironmentsConfig } from '../../utils/environmentUtils';
import { createManagementClient } from '../../managementClientFactory';
import { getStatusImplementationFilePath, loadMigrationsExecutionStatus } from '../../utils/statusManager';
import { IMigration } from '../../models/migration';
import { IRange } from '../../models/range';
import { loadStatusPlugin } from '../../utils/status/statusPlugin';

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
                'log-http-service-errors-to-console': {
                    alias: 'l',
                    describe: 'Log HttpService errors to console log.',
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
                        if (!getRange(args.range) && !getRangeDate(args.range)) {
                            throw new Error(chalk.red('The range has to be a string of a format "number:number" or "Tyyyy-mm-dd-hh-mm-ss:yyyy-mm-dd-hh-mm-ss" where the first value (to the left to ":") is less or equal to the second, eg.: "2:5".'));
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
        const runRange = argv.range && (exports.getRange(argv.range) || getRangeDate(argv.range));
        const logHttpServiceErrorsToConsole = argv.logHttpServiceErrorsToConsole;
        const continueOnError = argv.continueOnError;
        let migrationsResults: number = 0;
        const runForce = argv.force;

        if (argv.environment) {
            const environments = getEnvironmentsConfig();

            projectId = environments[argv.environment].projectId || argv.projectId;
            apiKey = environments[argv.environment].apiKey || argv.apiKey;
        }

        const plugin = fileExists(getStatusImplementationFilePath()) ? await loadStatusPlugin(getStatusImplementationFilePath().slice(0, -3) + '.js') : undefined;

        const apiClient = createManagementClient({
            projectId,
            apiKey,
            logHttpServiceErrorsToConsole,
        });

        await loadMigrationsExecutionStatus(plugin?.readStatus ?? null);

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

            const sortedMigrationsToRun = migrationsToRun.sort(orderComparator);
            let executedMigrationsCount = 0;
            for (const migration of sortedMigrationsToRun) {
                const migrationResult = await runMigration(migration, apiClient, projectId, plugin?.saveStatus ?? null);

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

            migrationsResults = await runMigration(migration, apiClient, projectId, plugin?.saveStatus ?? null);
        }

        process.exit(migrationsResults);
    },
};

export const getRange = (range: string): IRange<number> | null => {
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

export const getRangeDate = (range: string): IRange<Date> | null => {
    // format is Tyyyy-mm-dd-hh-mm-ss:yyyy-mm-dd-hh-mm-ss
    const match = range.match(/^T(?<from_date>\d{4}((-\d{2}){0,2}))(?:-(?<from_time>(\d{2}-){0,2}\d{2}))?:(?<to_date>\d{4}((-\d{2}){0,2}))(?:-(?<to_time>(\d{2}-){0,2}\d{2}))?$/);
    if (!match) {
        return null;
    }

    const from = new Date(formatDate(match.groups?.from_date ?? '', match.groups?.from_time ?? ''));
    const to = new Date(formatDate(match.groups?.to_date ?? '', match.groups?.to_time ?? ''));

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return null;
    }

    return from.getTime() <= to.getTime()
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

const getMigrationsByRange = (migrationsToRun: IMigration[], range: IRange<number | Date>): IMigration[] => {
    const migrations: IMigration[] = [];

    if (isIRangeDate(range)) {
        for (const migration of migrationsToRun.filter((x) => x.module.order instanceof Date)) {
            if ((migration.module.order as Date).getTime() >= range.from.getTime() && (migration.module.order as Date).getTime() <= range.to.getTime()) {
                migrations.push(migration);
            }
        }

        return migrations.filter(String);
    }

    for (const migration of migrationsToRun.filter((x) => typeof x.module.order === 'number')) {
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

const orderComparator = (migrationPrev: IMigration, migrationNext: IMigration) => {
    if (typeof migrationPrev.module.order === 'number' && typeof migrationNext.module.order === 'number') {
        return migrationPrev.module.order - migrationNext.module.order;
    }

    if (migrationPrev.module.order instanceof Date && migrationNext.module.order instanceof Date) {
        return migrationPrev.module.order.getTime() - migrationNext.module.order.getTime();
    }

    return typeof migrationPrev.module.order === 'number' ? -1 : 1;
};

const formatDate = (date: string, time: string) => {
    if (time === '') {
        time = '00:00';
    }
    if (time.length === 2) {
        time = time + ':00';
    } else {
        time = time.replaceAll('-', ':');
    }

    return `${date}T${time}Z`;
};

const isIRangeDate = (x: IRange<number | Date>): x is IRange<Date> => x.from instanceof Date && x.to instanceof Date;

// yargs needs exported command in exports object
Object.assign(exports, runMigrationCommand);
