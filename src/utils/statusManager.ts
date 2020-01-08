import { IMigrationStatus, IStatus } from '../models/status';
import { readFileSync, writeFileSync } from 'fs';
import { fileExists } from './fileUtils';
import * as path from 'path';

const migrationStatusFilename = 'status.json';
let status: IStatus;

export const init = () => {
    status = {};
};

const updateMigrationStatus = (projectId: string, migrationStatus: IMigrationStatus) => {
    let projectMigrationsStatus = status[projectId];

    if (projectMigrationsStatus === undefined) {
        projectMigrationsStatus = status[projectId] = [];
    } else {
        const previousMigrationStatus = projectMigrationsStatus.findIndex(
            migrationStatus => migrationStatus.name === migrationStatus.name
        );

        if (previousMigrationStatus > -1) {
            projectMigrationsStatus.splice(previousMigrationStatus, 1);
        }
    }

    projectMigrationsStatus.push(migrationStatus);

    saveStatusFile();
};

export const markAsCompleted = (projectId: string, name: string, order: number) => {
    const migrationStatus = {
        name,
        order,
        success: true,
        time: new Date(Date.now())
    };

    updateMigrationStatus(projectId, migrationStatus);
};

const saveStatusFile = () => {
    const statusJSON = JSON.stringify(status, null, 2);

    saveStatusToFile(statusJSON);
};

const getMigrationStatus = (migrationName: string, projectId: string): IMigrationStatus | undefined => {
    const projectStatus = status[projectId];
    if (projectStatus == null) {
        return undefined;
    }

    return projectStatus.find(migrationStatus => migrationStatus.name === migrationName);
};

export const wasExecuted = (migrationName: string, projectId: string): boolean => {
    return getMigrationStatus(migrationName, projectId) !== undefined;
};

const getStatusFilepath = (): string => {
    return path.join(process.cwd(), migrationStatusFilename);
};

export const loadMigrationsExecutionStatus = () => {
    const statusFilepath = getStatusFilepath();
    if (!fileExists(statusFilepath)) {
        status = {};
        return;
    }

    try {
        const projectsMigrationStatuses = readFileSync(statusFilepath).toString();

        status = JSON.parse(projectsMigrationStatuses);
    } catch (error) {
        console.warn(`Status JSON file is invalid because of ${error.message}. Continuing with empty status.`);
        status = {};
    }
};

const saveStatusToFile = (data: string): void => {
    const statusFilepath = getStatusFilepath();

    try {
        writeFileSync(statusFilepath, data, { flag: 'w' });
        console.log(`Status file was updated see ${statusFilepath}`);
    } catch (error) {
        console.error(`Status file save failed, because of ${error.message}`);
    }
};
