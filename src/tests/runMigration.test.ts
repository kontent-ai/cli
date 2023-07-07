import { IMigration } from '../models/migration';
import { runMigration } from '../utils/migrationUtils';
import * as statusManager from '../utils/statusManager';
import { createManagementClient } from '@kontent-ai/management-sdk';

jest.spyOn(statusManager, 'markAsCompleted').mockImplementation(async () => {});

describe('statusManager runMigration function', () => {
    it('runMigration no rollback function specified should throw', async () => {
        const migration: IMigration = {
            name: 'test_migration',
            module: {
                order: 1,
                run: async () => {},
            },
        };

        const returnCode = await runMigration({}, migration, {
            client: createManagementClient({ apiKey: '' }),
            environmentId: 'fcb801c6-fe1d-41cf-af91-ec13802a1ed2',
            operation: 'rollback',
            saveStatusFromPlugin: null,
        });

        expect(returnCode).toEqual(1);
    });

    it('runMigration rollback function specified should  call rollback', async () => {
        const migration: IMigration = {
            name: 'test_migration',
            module: {
                order: 1,
                run: async () => {},
                rollback: async () => {},
            },
        };

        const rollback = jest.spyOn(migration.module, 'rollback');

        const returnCode = await runMigration({}, migration, {
            client: createManagementClient({ apiKey: '' }),
            environmentId: 'fcb801c6-fe1d-41cf-af91-ec13802a1ed2',
            operation: 'rollback',
            saveStatusFromPlugin: null,
        });

        expect(rollback).toBeCalledTimes(1);
        expect(returnCode).toEqual(0);
    });

    it('runMigration should  call run', async () => {
        const migration: IMigration = {
            name: 'test_migration',
            module: {
                order: 1,
                run: async () => {},
                rollback: async () => {},
            },
        };

        const run = jest.spyOn(migration.module, 'run');

        const returnCode = await runMigration({}, migration, {
            client: createManagementClient({ apiKey: '' }),
            environmentId: 'fcb801c6-fe1d-41cf-af91-ec13802a1ed2',
            operation: 'run',
            saveStatusFromPlugin: null,
        });

        expect(run).toBeCalledTimes(1);
        expect(returnCode).toEqual(0);
    });
});
