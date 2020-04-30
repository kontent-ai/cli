import yargs from 'yargs';
import chalk from 'chalk';
import { environmentConfigExists, getEnvironmentsConfig } from '../utils/environmentUtils';
import { CleanService, ExportService, ImportService, ZipService } from '@kentico/kontent-backup-manager';
import { getFileBackupName } from '../utils/fileUtils';
import { IProcessedItem } from '@kentico/kontent-backup-manager';

const kontentBackupCommand: yargs.CommandModule = {
    command: 'backup',
    describe: 'Kontent backup tool to backup & restore Kentico Kontent projects through Management API.',
    builder: (yargs: any) =>
        yargs
            .options({
                action: {
                    alias: 'a',
                    describe: 'Action for backup',
                    type: 'string',
                },
                name: {
                    alias: 'n',
                    describe: 'Name of zip file',
                    type: 'string',
                },
                log: {
                    alias: 'l',
                    describe: 'Enables/Disables logging',
                    type: 'boolean',
                    default: true,
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
            })
            .conflicts('environment', 'api-key')
            .conflicts('environment', 'project-id')
            .check((args: any) => {
                if (!args.environment && !(args.projectId && args.apiKey)) {
                    throw new Error(chalk.red('Specify an environment or a project ID with its Management API key.'));
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
    handler: async (argv: any) => {
        let projectId = argv.projectId;
        let apiKey = argv.apiKey;
        if (argv.environment) {
            const environments = getEnvironmentsConfig();

            projectId = environments[argv.environment].projectId || argv.projectId;
            apiKey = environments[argv.environment].apiKey || argv.apiKey;
        }

        const defaultBackupName = getFileBackupName();
        const zipService = new ZipService({
            filename: argv.name || defaultBackupName,
            enableLog: argv.log,
        });

        console.log('Starting backup tool');

        switch (argv.action) {
            case 'backup':
                const exportService = new ExportService({
                    apiKey: apiKey,
                    projectId: projectId,
                    onExport: (item: IProcessedItem) => {
                        if (argv.log) {
                            console.log(`Exported: ${item.title} | ${item.type}`);
                        }
                    },
                });
                const exportedData = await exportService.exportAllAsync();
                await zipService.createZipAsync(exportedData);
                break;

            case 'restore':
                const zipData = await zipService.extractZipAsync();
                const importService = new ImportService({
                    onImport: (item: IProcessedItem) => {
                        if (argv.log) {
                            console.log(`Imported: ${item.title} | ${item.type}`);
                        }
                    },
                    projectId: projectId,
                    apiKey: apiKey,
                    enableLog: argv.log,
                    fixLanguages: true,
                    workflowIdForImportedItems: '00000000-0000-0000-0000-000000000000',
                });
                await importService.importFromSourceAsync(zipData);
                break;

            case 'clean':
                const cleanService = new CleanService({
                    onDelete: (item: IProcessedItem) => {
                        if (argv.log) {
                            console.log(`Deleted: ${item.title} | ${item.type}`);
                        }
                    },
                    projectId: projectId,
                    apiKey: apiKey,
                });

                await cleanService.cleanAllAsync();
                break;

            default:
                throw new Error('Unknown action type');
        }

        console.log('Completed');
        process.exit(0);
    },
};

// yargs needs exported command in exports object
Object.assign(exports, kontentBackupCommand);
