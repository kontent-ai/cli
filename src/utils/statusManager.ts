import { IMigrationStatus, IStatus } from '../models/status';
import { readFileSync, writeFileSync } from 'fs';
import { fileExists } from './fileUtils';
import * as path from 'path';
import { type StatusPlugin } from './status/statusPlugin';

const migrationStatusFilename = 'status.json';
const pluginsFilename = 'plugins.js';
let status: IStatus = {};

const updateMigrationStatus = async (projectId: string, migrationStatus: IMigrationStatus, saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
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

    await saveStatusFile(saveStatusFromPlugin);
};

export const markAsCompleted = async (projectId: string, name: string, order: number | Date, saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
    const migrationStatus = {
        name,
        order,
        success: true,
        time: new Date(Date.now()),
    };

    await updateMigrationStatus(projectId, migrationStatus, saveStatusFromPlugin);
};

const saveStatusFile = async (saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
    const statusJSON = JSON.stringify(status, null, 2);

    if (saveStatusFromPlugin) {
        try {
            await saveStatusFromPlugin(statusJSON);
        } catch (e) {
            console.error(`The error ${e} occured when using saveStatus function from plugin.`);
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

export const loadMigrationsExecutionStatus = async (readStatusFromPlugin: StatusPlugin['readStatus'] | null) => {
    if (readStatusFromPlugin) {
        try {
            status = await readStatusFromPlugin();
        } catch (e) {
            console.error(`The error ${e} occured when using readStatus function from plugin.`);
        } finally {
            return;
        }
    }

    status = readFromStatus();
};

const readFromStatus = (): IStatus => {
    const statusFilepath = getStatusFilepath();
    if (!fileExists(statusFilepath)) {
        return {};
    }

    try {
        const projectsMigrationStatuses = readFileSync(getStatusFilepath()).toString();

        return JSON.parse(projectsMigrationStatuses);
    } catch (error) {
        console.warn(`Status JSON file is invalid because of ${error instanceof Error ? error.message : 'unknown error.'}. Continuing with empty status.`);
        return {};
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

export const getPluginsFilePath = () => path.join(process.cwd(), pluginsFilename);
