import * as statusManager from '../utils/statusManager';
import * as fileUtils from '../utils/fileUtils';
import * as fs from 'fs';
import * as path from 'path';
import { IStatus } from '../models/status';

const readStatusFile = (): IStatus => {
    const statusFilepath = path.join(process.cwd(), 'status.json');

    const fileContent = fs.readFileSync(statusFilepath).toString();
    return JSON.parse(fileContent);
};

describe('Status manager', () => {
    beforeAll(() => {
        jest.spyOn(Date, 'now').mockImplementation(() => 1575939660000);
    });

    it('Environment has success status in status manager file', async () => {
        const environmentId = 'environment1';
        const migrationName = 'migration1';
        await statusManager.markAsCompleted({}, environmentId, migrationName, 1, 'run', null);

        const statusFile = readStatusFile();
        const status = statusFile[environmentId][0];

        expect(status).toMatchSnapshot();
    });

    it('Not executed migration is not present in status file', async () => {
        const environment1 = 'environment1';
        const environment2 = 'environment2';
        const migration1Name = 'migration1';
        await statusManager.markAsCompleted({}, environment1, migration1Name, 1, 'run', null);

        const environmentMigrationStatus = statusManager.shouldSkipMigration({}, migration1Name, environment2, 'run');

        expect(environmentMigrationStatus).toBe(false);
    });

    it('Executed migration is present in status file', async () => {
        const environmentId2 = 'environment2';
        const migration2Name = 'migration2';
        await statusManager.markAsCompleted({}, environmentId2, migration2Name, 1, 'run', null);

        const environmentMigrationStatus = statusManager.shouldSkipMigration({}, environmentId2, migration2Name, 'run');

        expect(environmentMigrationStatus).toBe(false);
    });

    it('loadMigrationsExecutionStatus to be called with plugins', async () => {
        const expectedStatus = { '30816c62-8d41-4dc4-a1ab-40440070b7bf': [] };

        const readStatusPlugin = async () => {
            return expectedStatus;
        };

        const returnedStatus = await statusManager.loadMigrationsExecutionStatus(readStatusPlugin);

        expect(returnedStatus).toEqual(expectedStatus);
    });

    it('loadMigrationsExecutionStatus to be called with plugin that throw', async () => {
        const readStatusPlugin = async () => {
            throw new Error('Error during plugin function');
        };

        expect.assertions(1);

        return statusManager.loadMigrationsExecutionStatus(readStatusPlugin).catch((e) => expect((e as Error).message).toMatch('Error during plugin function'));
    });

    it('MarkAsCompleted to be called with plugins', async () => {
        jest.spyOn(fileUtils, 'fileExists').mockReturnValue(true);

        const saveStatusMocked = jest.fn().mockImplementation(() => Promise.resolve());

        await statusManager.markAsCompleted({}, '', 'testMigration', 1, 'run', saveStatusMocked);

        expect(saveStatusMocked).toHaveBeenCalled();
    });
});
