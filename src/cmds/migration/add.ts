import yargs from 'yargs';
import chalk from 'chalk';
import { createMigration } from '../../utils/migrationUtils';
import { TemplateType } from '../../models/templateType';

const addMigrationCommand: yargs.CommandModule = {
    command: 'add',
    describe: 'Generates a template script (in JavaScript or TypeScript) for running a migration on a Kontent.ai project.',
    builder: (yargs: any) =>
        yargs
            .options({
                name: {
                    alias: 'n',
                    describe: 'Migration name',
                    type: 'string',
                },
                'template-type': {
                    alias: 't',
                    describe: 'Determines whether the template script is in TypeScript or plain JavaScript',
                    type: 'string',
                    default: 'javascript',
                },
                'timestamp-order': {
                    alias: 'd',
                    describe: 'Let order of the migrations be determined by the time it was created.',
                    type: 'boolean',
                    default: false,
                },
            })
            .demandOption(['name', 'template-type', 'timestamp-order']),
    handler: (argv: any) => {
        if (!['javascript', 'typescript'].includes(argv.templateType)) {
            console.error(chalk.redBright(`Unexpected template type ${argv.templateType} allowed is [typescript, javascript]`));
            process.exit(1);
        }

        const templateType = argv.templateType === 'javascript' ? TemplateType.Javascript : TemplateType.TypeScript;
        createMigration(argv.name, templateType, argv.timestampOrder);
    },
};

// yargs needs exported command in exports object
Object.assign(exports, addMigrationCommand);
