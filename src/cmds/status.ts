import yargs from 'yargs';
import { createStatusImplementationFile } from '../utils/statusManager';

const statusCommand: yargs.CommandModule = {
    command: 'status',
    describe: 'Status commands',
    builder: (yargs: any) =>
        yargs
            .options({
                implementation: {
                    alias: 'i',
                    describe: 'Implement your own save/read functions to deal with status.json.',
                    type: 'boolean',
                },
            })
            .demandOption(['implementation']),
    handler: (argv: any) => {
        if (argv.implementation) {
            createStatusImplementationFile();
        }
    },
};

Object.assign(exports, statusCommand);
