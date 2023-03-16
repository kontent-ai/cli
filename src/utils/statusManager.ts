import { IMigrationStatus, IStatus } from '../models/status';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileExists } from './fileUtils';
import * as path from 'path';
import { loadStatusPlugin } from './status/statusPlugin';

const migrationStatusFilename = 'status.json';
const statusDirectoryName = 'status';
const statusImplementationFilename = 'statusImpl.ts';
let status: IStatus = {};

const updateMigrationStatus = async (projectId: string, migrationStatus: IMigrationStatus) => {
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

    await saveStatusFile();
};

export const markAsCompleted = async (projectId: string, name: string, order: number | Date) => {
    const migrationStatus = {
        name,
        order,
        success: true,
        time: new Date(Date.now()),
    };

    await updateMigrationStatus(projectId, migrationStatus);
};

const saveStatusFile = async () => {
    const statusJSON = JSON.stringify(status, null, 2);

    if (fileExists(getStatusImplementationFilePath())) {
        try {
            const file = await loadStatusPlugin(getStatusImplementationFilePath().slice(0, -3) + '.js');
            file.saveStatusToFile(statusJSON);
        } catch (e) {
            console.log(`Could not load the plugin due to ${e}. Fallbacking to status.json`);
            saveStatusToFile(statusJSON);
        } finally {
            return;
        }
    }
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
        status = readFromStatus();
    } catch (error) {
        console.warn(`Status JSON file is invalid because of ${error instanceof Error ? error.message : 'unknown error.'}. Continuing with empty status.`);
    }
};

const readFromStatus = (): IStatus => {
    const projectsMigrationStatuses = readFileSync(getStatusFilepath()).toString();

    return JSON.parse(projectsMigrationStatuses);
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

const getStatusImplementationFilePath = () => path.join(process.cwd(), statusDirectoryName, statusImplementationFilename);

const getStatusImplementationDirectoryPath = () => path.join(process.cwd(), statusDirectoryName);

export const createStatusImplementationFile = () => {
    const statusImplementationPath = getStatusImplementationFilePath();

    if (fileExists(statusImplementationPath)) {
        console.error(`File ${statusImplementationPath} already exists`);
    }

    try {
        if (!fileExists(getStatusImplementationDirectoryPath())) {
            mkdirSync(getStatusImplementationDirectoryPath());
        }

        writeFileSync(statusImplementationPath, statusImplementationTemplate, { flag: 'w' });
        console.log(`Status.ts file was created see ${statusImplementationPath}`);
    } catch (error) {
        console.error(`Status.ts file creation failed, because of ${error instanceof Error ? error.message : 'unknown error.'}`);
    }
};

const statusImplementationTemplate = `
import type {IStatus} from "@kontent-ai/cli";

export const saveStatusToFile = (data: string) => {

}

export const readStatusFromFile = (): IStatus => {

}
`;
