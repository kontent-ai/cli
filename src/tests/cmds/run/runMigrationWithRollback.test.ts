import yargs from 'yargs';
import { IMigration } from '../../../models/migration';
import * as migrationUtils from '../../../utils/migrationUtils';
import * as statusManager from '../../../utils/statusManager';
import { IStatus } from '../../../models/status';

const { handler } = require('../../../cmds/migration/run');

const migrations: IMigration[] = [
    {
        name: 'test1',
        module: {
            order: 1,
            run: async () => {
                console.log('test1');
            },
            rollback: async () => {
                console.log('rollback 1');
            },
        },
    },
    {
        name: 'test2',
        module: {
            order: 2,
            run: async () => {
                console.log('test2');
            },
            rollback: async () => {
                console.log('rollback 2');
            },
        },
    },
    {
        name: 'test3',
        module: {
            order: 3,
            run: async () => {
                console.log('test3');
            },
            rollback: async () => {
                console.log('rollback 3');
            },
        },
    },
];

const migrationStatus: IStatus = {
    'fcb801c6-fe1d-41cf-af91-ec13802a1ed2': [
        {
            name: 'test1',
            success: true,
            order: 1,
            time: new Date(Date.now()),
            lastOperation: 'run',
        },
        {
            name: 'test2',
            success: true,
            order: 2,
            time: new Date(Date.now()),
            lastOperation: 'rollback',
        },
        {
            name: 'test3',
            success: true,
            order: 3,
            time: new Date(Date.now()),
            lastOperation: 'run',
        },
    ],
};

const migrationStatusAllRollbacks: IStatus = {
    'fcb801c6-fe1d-41cf-af91-ec13802a1ed2': [
        {
            name: 'test1',
            success: true,
            order: 1,
            time: new Date(Date.now()),
            lastOperation: 'rollback',
        },
        {
            name: 'test2',
            success: true,
            order: 2,
            time: new Date(Date.now()),
            lastOperation: 'rollback',
        },
        {
            name: 'test3',
            success: true,
            order: 3,
            time: new Date(Date.now()),
            lastOperation: 'rollback',
        },
    ],
};

describe('run migration command tests', () => {
    let mockExit: jest.SpyInstance<never, [code?: number | undefined]>;
    beforeEach(() => {
        jest.restoreAllMocks();
        jest.clearAllMocks();

        jest.spyOn(statusManager, 'markAsCompleted').mockImplementation(async () => {});

        jest.spyOn(migrationUtils, 'loadMigrationFiles').mockReturnValue(
            new Promise((resolve) => {
                resolve(migrations);
            })
        );

        mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
            return undefined as never;
        });
    });

    it('with date range all, all rollbacks should be called', async () => {
        jest.spyOn(statusManager, 'loadMigrationsExecutionStatus').mockImplementation(async () => ({}));

        const args: any = yargs.parse([], {
            apiKey: '',
            projectId: 'fcb801c6-fe1d-41cf-af91-ec13802a1ed2',
            range: '',
            all: true,
            rollback: 'true',
        });

        const migration1 = jest.spyOn(migrations[0].module, 'rollback');
        const migration2 = jest.spyOn(migrations[1].module, 'rollback');
        const migration3 = jest.spyOn(migrations[2].module, 'rollback');

        await handler(args);

        const migration3Order = migration3.mock.invocationCallOrder[0];
        const migration2Order = migration2.mock.invocationCallOrder[0];
        const migration1Order = migration1.mock.invocationCallOrder[0];

        expect(migration1).toBeCalledTimes(1);
        expect(migration2).toBeCalledTimes(1);
        expect(migration3).toBeCalledTimes(1);

        expect(migration3Order).toBeLessThan(migration2Order);
        expect(migration2Order).toBeLessThan(migration1Order);

        expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('with date range all, only rollback from first and last migrations should should be called', async () => {
        jest.spyOn(statusManager, 'loadMigrationsExecutionStatus').mockImplementation(async () => migrationStatus);

        const args: any = yargs.parse([], {
            apiKey: '',
            projectId: 'fcb801c6-fe1d-41cf-af91-ec13802a1ed2',
            range: '',
            all: true,
            rollback: 'true',
        });

        const migration1 = jest.spyOn(migrations[0].module, 'rollback');
        const migration2 = jest.spyOn(migrations[1].module, 'rollback');
        const migration3 = jest.spyOn(migrations[2].module, 'rollback');

        await handler(args);

        const migration3Order = migration3.mock.invocationCallOrder[0];
        const migration1Order = migration1.mock.invocationCallOrder[0];

        expect(migration3).toBeCalledTimes(1);
        expect(migration2).not.toBeCalled();

        expect(migration3Order).toBeLessThan(migration1Order);
        expect(migration1).toBeCalledTimes(1);

        expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('with date range all, only rollback from first and last migrations should should be called', async () => {
        jest.spyOn(statusManager, 'loadMigrationsExecutionStatus').mockImplementation(async () => migrationStatusAllRollbacks);

        const args: any = yargs.parse([], {
            apiKey: '',
            projectId: 'fcb801c6-fe1d-41cf-af91-ec13802a1ed2',
            range: '',
            all: true,
            rollback: 'true',
        });

        const migration1 = jest.spyOn(migrations[0].module, 'rollback');
        const migration2 = jest.spyOn(migrations[1].module, 'rollback');
        const migration3 = jest.spyOn(migrations[2].module, 'rollback');

        await handler(args);

        expect(migration3).not.toBeCalled();
        expect(migration2).not.toBeCalled();
        expect(migration1).not.toBeCalled();

        expect(mockExit).toHaveBeenCalledWith(0);
    });

});
