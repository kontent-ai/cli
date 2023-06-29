import yargs from 'yargs';
import chalk from 'chalk';
import { environmentConfigExists, getEnvironmentsConfig } from '../utils/environmentUtils';
import { CleanService, ExportService, ImportService, ZipService, IProcessedItem } from '@kontent-ai/backup-manager';
import { getFileBackupName } from '../utils/fileUtils';
import { FileService } from '@kontent-ai/backup-manager/dist/cjs/lib/node';

const kontentBackupCommand: yargs.CommandModule = {
    command: 'backup',
    describe: 'Kontent.ai backup tool to backup & restore environments through Management API.',
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
                'environment-id': {
                    alias: 'e',
                    describe: 'Environment ID to run the migration script on',
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
                'preserve-workflow': {
                    alias: 'ep',
                    describe: 'Indicates if language variant workflow information should be preserved. Enabled by default',
                    type: 'boolean',
                    default: true,
                },
            })
            .conflicts('environment', 'api-key')
            .conflicts('environment', 'environment-id')
            .check((args: any) => {
                if (!args.environment && !(args.environmentId && args.apiKey)) {
                    throw new Error(chalk.red('Specify an environment or a environment ID with its Management API key.'));
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
        let environmentId = argv.environmentId;
        let apiKey = argv.apiKey;
        if (argv.environment) {
            const environments = getEnvironmentsConfig();

            environmentId = environments[argv.environment].environmentId || argv.environmentId;
            apiKey = environments[argv.environment].apiKey || argv.apiKey;
        }

        const defaultBackupName = getFileBackupName();
        const zipService = new ZipService({
            context: 'node.js',
            enableLog: argv.log,
        });

        console.log('Starting backup tool');

        const fileService = new FileService({
            enableLog: argv.log,
        });

        switch (argv.action) {
            case 'backup':
                const exportService = new ExportService({
                    apiKey: apiKey,
                    projectId: environmentId,
                    onExport: (item: IProcessedItem) => {
                        if (argv.log) {
                            console.log(`Exported: ${item.title} | ${item.type}`);
                        }
                    },
                    skipValidation: true,
                });
                const exportedData = await exportService.exportAllAsync();
                await zipService.createZipAsync(exportedData);
                const backupZipData = await zipService.createZipAsync(exportedData);
                await fileService.writeFileAsync(argv.name || defaultBackupName, backupZipData);
                break;

            case 'restore':
                const zipData = await zipService.extractZipAsync(await fileService.loadFileAsync(argv.name || defaultBackupName));
                const importService = new ImportService({
                    onImport: (item: IProcessedItem) => {
                        if (argv.log) {
                            console.log(`Imported: ${item.title} | ${item.type}`);
                        }
                    },
                    preserveWorkflow: argv.preserveWorkflow,
                    projectId: environmentId,
                    apiKey: apiKey,
                    enableLog: argv.log,
                    fixLanguages: true,
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
                    projectId: environmentId,
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
