#!/usr/bin/env node
import yargs from 'yargs';

const createMigrationTool = (): number => {
    yargs
        .usage(
            'The Kontent CLI is a tool you can use for generating and running Kentico Kontent migration scripts.'
        )
        .scriptName('kontent')
        .commandDir('cmds')
        .demandCommand(1, 'Please specify a command')
        .wrap(null)
        .help('h')
        .alias('h', 'help')
        .example(
            'kontent',
            'environment add --name DEV --project-id <YOUR_PROJECT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>'
        )
        .example('kontent', 'migration add --name 02_my_migration')

        .example(
            'kontent',
            'migration run --name migration01 --project-id <YOUR_PROJECT_ID> --api-key <YOUR_MANAGEMENT_API_KEY>'
        )
        .example(
            'kontent',
            'migration run --name migration01 --environment DEV --debug true'
        )
        .example('kontent', 'migration run --all --environment DEV')
        .strict().argv;

    return 0;
};

createMigrationTool();
