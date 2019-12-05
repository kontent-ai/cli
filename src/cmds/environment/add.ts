import yargs from 'yargs';
import { saveEnvironmentConfig } from '../../utils/environmentUtils';

const addEnvironmentCommand: yargs.CommandModule = {
    command: 'add',
    describe:
        "Creates an environment to run the migrations on. The environment is defined as a named pair of values. For example, a 'DEV' environment can be defined as a pair of specific project ID and Management API key.",
    builder: (yargs: any) =>
        yargs
            .options({
                name: {
                    alias: 'n',
                    describe: 'Environment name',
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
                }
            })
            .demandOption(['project-id', 'api-key', 'name']),
    handler: (argv: any) => {
        saveEnvironmentConfig(argv.name, argv.projectId, argv.apiKey);
    }
};

// yargs needs exported command in exports object
Object.assign(exports, addEnvironmentCommand);
