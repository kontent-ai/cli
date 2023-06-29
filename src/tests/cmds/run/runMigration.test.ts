import yargs from 'yargs';
import { IMigration } from '../../../models/migration';
import * as migrationUtils from '../../../utils/migrationUtils';
import * as statusManager from '../../../utils/statusManager';

const { handler } = require('../../../cmds/migration/run');

const migrations: IMigration[] = [
    {
        name: 'test1',
        module: {
            order: new Date('2023-03-25T10:00:00.000Z'),
            run: async () => {
                console.log('test1');
            },
        },
    },
    {
        name: 'test2',
        module: {
            order: new Date('2023-03-26T10:00:00.000Z'),
            run: async () => {
                console.log('test2');
            },
        },
    },
    {
        name: 'test3',
        module: {
            order: new Date('2023-03-27T10:00:00.000Z'),
            run: async () => {
                console.log('test3');
            },
        },
    },
];

jest.spyOn(statusManager, 'markAsCompleted').mockImplementation(async () => {});
jest.spyOn(statusManager, 'loadMigrationsExecutionStatus').mockImplementation(async () => ({}));
jest.spyOn(migrationUtils, 'loadMigrationFiles').mockReturnValue(
    new Promise((resolve) => {
        resolve(migrations);
    })
);

const migration1 = jest.spyOn(migrations[0].module, 'run');
const migration2 = jest.spyOn(migrations[1].module, 'run');
const migration3 = jest.spyOn(migrations[2].module, 'run');

const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
    return undefined as never;
});

describe('run migration command tests', () => {
    it('with date range (T2023-03-25:2023-03-27), two migrations should be called', async () => {
        const args: any = yargs.parse([], {
            apiKey: '',
            environmentId: '',
            range: 'T2023-03-25:2023-03-27',
        });

        await handler(args);

        expect(migration1).toBeCalled();
        expect(migration2).toBeCalled();
        expect(migration3).not.toBeCalled();

        expect(mockExit).toHaveBeenCalledWith(0);
    });
});
