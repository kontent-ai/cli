import { markAsCompleted, wasSuccessfullyExecuted } from '../utils/statusManager';
import { readFileSync } from 'fs';
import * as path from 'path';
import { IStatus } from '../models/status';

const readStatusFile = (): IStatus => {
    const statusFilepath = path.join(process.cwd(), 'status.json');

    const fileContent = readFileSync(statusFilepath).toString();
    return JSON.parse(fileContent);
};

describe('Status manager', () => {
    beforeEach(() => {
        jest.spyOn(Date, 'now').mockImplementation(() => 1575939660000);
    });

    it('Project has success status in status manager file', () => {
        const projectId = 'project1';
        const migrationName = 'migration1';
        markAsCompleted(projectId, migrationName, 1);

        const statusFile = readStatusFile();
        const status = statusFile[projectId][0];

        expect(status).toMatchSnapshot();
    });

    it('Not executed migration is not present in status file', () => {
        const project1Id = 'project1';
        const project2Id = 'project2';
        const migration1Name = 'migration1';
        markAsCompleted(project1Id, migration1Name, 1);

        const projectMigrationStatus = wasSuccessfullyExecuted(migration1Name, project2Id);

        expect(projectMigrationStatus).toBe(false);
    });

    it('Executed migration is present in status file', () => {
        const project2Id = 'project2';
        const migration2Name = 'migration2';
        markAsCompleted(project2Id, migration2Name, 1);

        const projectMigrationStatus = wasSuccessfullyExecuted(project2Id, migration2Name);

        expect(projectMigrationStatus).toBe(false);
    });
});
