import yargs from 'yargs';

const migrationCommand: yargs.CommandModule = {
    command: 'migration <command>',
    describe: 'Migration commands',
    builder: (yargs: any) =>
        yargs
            .commandDir('migration')
            .demandCommand(2, 'Please specify a migration arguments'),
    handler: (argv: any) => {}
};

// yargs needs exported command in exports object
Object.assign(exports, migrationCommand);
