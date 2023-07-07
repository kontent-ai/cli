import yargs from 'yargs';
import { saveEnvironmentConfig } from '../../utils/environmentUtils';

const addEnvironmentCommand: yargs.CommandModule = {
    command: 'add',
    describe: 'Store information about the environment locally. The environment is defined as a named pair of values. For example, a "DEV" environment can be defined as a pair of specific environment ID and Management API key.',
    builder: (yargs: any) =>
        yargs
            .options({
                name: {
                    alias: 'n',
                    describe: 'Environment name',
                    type: 'string',
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
            })
            .demandOption(['environment-id', 'api-key', 'name']),
    handler: (argv: any) => {
        saveEnvironmentConfig(argv.name, argv.environmentId, argv.apiKey);
    },
};

// yargs needs exported command in exports object
Object.assign(exports, addEnvironmentCommand);
