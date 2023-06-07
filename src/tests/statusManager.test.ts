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

    it('Project has success status in status manager file', async () => {
        const projectId = 'project1';
        const migrationName = 'migration1';
        await statusManager.markAsCompleted({}, projectId, migrationName, 1, 'run', null);

        const statusFile = readStatusFile();
        const status = statusFile[projectId][0];

        expect(status).toMatchSnapshot();
    });

    it('Not executed migration is not present in status file', async () => {
        const project1Id = 'project1';
        const project2Id = 'project2';
        const migration1Name = 'migration1';
        await statusManager.markAsCompleted({}, project1Id, migration1Name, 1, 'run', null);

        const projectMigrationStatus = statusManager.shouldSkipMigration({}, migration1Name, project2Id, 'run');

        expect(projectMigrationStatus).toBe(false);
    });

    it('Executed migration is present in status file', async () => {
        const project2Id = 'project2';
        const migration2Name = 'migration2';
        await statusManager.markAsCompleted({}, project2Id, migration2Name, 1, 'run', null);

        const projectMigrationStatus = statusManager.shouldSkipMigration({}, project2Id, migration2Name, 'run');

        expect(projectMigrationStatus).toBe(false);
    });

    it('loadMigrationsExecutionStatus to be called with plugins', async () => {
        jest.spyOn(fileUtils, 'fileExists').mockReturnValue(true);

        const readStatusMocked = jest.fn().mockResolvedValue({});

        await statusManager.loadMigrationsExecutionStatus(readStatusMocked);

        expect(readStatusMocked).toHaveBeenCalled();
    });

    it('MarkAsCompleted to be called with plugins', async () => {
        jest.spyOn(fileUtils, 'fileExists').mockReturnValue(true);

        const saveStatusMocked = jest.fn().mockImplementation(() => Promise.resolve());

        await statusManager.markAsCompleted({}, '', 'testMigration', 1, 'run', saveStatusMocked);

        expect(saveStatusMocked).toHaveBeenCalled();
    });
});
