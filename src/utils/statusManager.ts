import { IMigrationStatus, IStatus } from '../models/status';
import { readFileSync, writeFileSync } from 'fs';
import { fileExists } from './fileUtils';
import * as path from 'path';

const migrationStatusFilename = 'status.json';
let status: IStatus = {};

const updateMigrationStatus = (projectId: string, migrationStatus: IMigrationStatus) => {
    let projectMigrationsHistory = status[projectId];

    if (projectMigrationsHistory === undefined) {
        projectMigrationsHistory = status[projectId] = [];
    }

    const previousMigrationStatusIndex = projectMigrationsHistory.findIndex((executedMigration) => executedMigration.name === migrationStatus.name);
    if (previousMigrationStatusIndex > -1) {
        projectMigrationsHistory[previousMigrationStatusIndex] = migrationStatus;
    } else {
        projectMigrationsHistory.push(migrationStatus);
    }

    saveStatusFile();
};

export const markAsCompleted = (projectId: string, name: string, order: number | Date) => {
    const migrationStatus = {
        name,
        order,
        success: true,
        time: new Date(Date.now()),
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

    return projectStatus.find((migrationStatus) => migrationStatus.name === migrationName);
};

export const wasSuccessfullyExecuted = (migrationName: string, projectId: string): boolean => {
    const result = getMigrationStatus(migrationName, projectId);
    return !!result && result.success;
};

const getStatusFilepath = (): string => {
    return path.join(process.cwd(), migrationStatusFilename);
};

export const loadMigrationsExecutionStatus = () => {
    const statusFilepath = getStatusFilepath();
    if (!fileExists(statusFilepath)) {
        return;
    }

    try {
        const projectsMigrationStatuses = readFileSync(statusFilepath).toString();

        status = JSON.parse(projectsMigrationStatuses);
    } catch (error) {
        console.warn(`Status JSON file is invalid because of ${error instanceof Error ? error.message : 'unknown error.'}. Continuing with empty status.`);
    }
};

const saveStatusToFile = (data: string): void => {
    const statusFilepath = getStatusFilepath();

    try {
        writeFileSync(statusFilepath, data, { flag: 'w' });
        console.log(`Status file was updated see ${statusFilepath}`);
    } catch (error) {
        console.error(`Status file save failed, because of ${error instanceof Error ? error.message : 'unknown error.'}`);
    }
};
