import yargs from 'yargs';

const environmentCommand: yargs.CommandModule = {
    command: 'environment <command>',
    describe: 'Environment commands',
    builder: (yargs: any) => {
        return yargs.commandDir('environment').demandCommand(2, 'Please specify a environment arguments');
    },
    handler: (argv: any) => {},
};

// yargs needs exported command in exports object
Object.assign(exports, environmentCommand);
