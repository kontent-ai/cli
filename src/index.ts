#!/usr/bin/env node
import yargs from 'yargs';

const createMigrationTool = (): number => {
    yargs
        .usage('The Kontent.ai CLI is a tool you can use for generating and running Kontent.ai migration scripts.')
        .scriptName('kontent')
        .commandDir('cmds')
        .demandCommand(1, 'Please specify a command')
        .wrap(null)
        .help('h')
        .alias('h', 'help')
        .example('kontent', 'environment add --name DEV --environment-id <YOUR_ENVIRONMENT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>')
        .example('kontent', 'migration add --name 02_my_migration')

        .example('kontent', 'migration run --name migration01 --environment-id <YOUR_ENVIRONMENT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>')
        .example('kontent', 'migration run --name migration01 --environment DEV --debug true')
        .example('kontent', 'migration run --all --environment DEV')
        .example('kontent', 'migration run --range 1:4 --environment DEV')

        .example('kontent', 'backup --action backup --environment-id <YOUR_ENVIRONMENT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>')
        .example('kontent', 'backup --action backup --environment <YOUR_ENVIRONMENT>')
        .example('kontent', 'backup --action restore --name backup_file --environment-id <YOUR_ENVIRONMENT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>')
        .example('kontent', 'backup --action restore --name backup_file --environment <YOUR_ENVIRONMENT> --preserve-workflow false')
        .example('kontent', 'backup --action clean --environment-id <YOUR_ENVIRONMENT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>')
        .strict().argv;

    return 0;
};

createMigrationTool();
