import { IMigrationStatus, IStatus, Operation } from '../models/status';
import { readFileSync, writeFileSync } from 'fs';
import { fileExists } from './fileUtils';
import * as path from 'path';
import { type StatusPlugin } from './status/statusPlugin';


const migrationStatusFilename = 'status.json';
const pluginsFilename = 'plugins.js';
// let status: IStatus = {};

const updateMigrationStatus = async (status: IStatus, projectId: string, migrationStatus: IMigrationStatus, saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
    status[projectId] = status[projectId] === undefined ? [] : status[projectId];
    const projectMigrationsHistory = status[projectId];

    const previousMigrationStatusIndex = projectMigrationsHistory.findIndex((executedMigration) => executedMigration.name === migrationStatus.name);
    if (previousMigrationStatusIndex > -1) {
        projectMigrationsHistory[previousMigrationStatusIndex] = migrationStatus;
    } else {
        projectMigrationsHistory.push(migrationStatus);
    }

    await saveStatusFile(status, saveStatusFromPlugin);
};

export const markAsCompleted = async (status: IStatus, projectId: string, name: string, order: number | Date, operation: Operation, saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
    const migrationStatus: IMigrationStatus = {
        name,
        order,
        success: true,
        time: new Date(Date.now()),
        lastOperation: operation,
    };

    await updateMigrationStatus(status, projectId, migrationStatus, saveStatusFromPlugin);
};

const saveStatusFile = async (migrationsStatus: IStatus, saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
    const statusJSON = JSON.stringify(migrationsStatus, null, 2);

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

const getMigrationStatus = (migrationsStatus: IStatus, migrationName: string, projectId: string): IMigrationStatus | null => {
    const projectStatus = migrationsStatus[projectId];

    return projectStatus === undefined ? null : projectStatus.find((migrationStatus) => migrationStatus.name === migrationName) ?? null;
};

export const shouldSkipMigration = (migrationsStatus: IStatus, migrationName: string, projectId: string, operation: Operation): boolean => {
    const migrationStatus = getMigrationStatus(migrationsStatus, migrationName, projectId);

    if (migrationStatus === null || !migrationStatus.success) {
        return false;
    }

    return (migrationStatus?.lastOperation ?? 'run') === operation;
};

const getStatusFilepath = (): string => {
    return path.join(process.cwd(), migrationStatusFilename);
};

export const loadMigrationsExecutionStatus = async (readStatusFromPlugin: StatusPlugin['readStatus'] | null): Promise<IStatus> => {
    if (readStatusFromPlugin) {
        try {
            return await readStatusFromPlugin();
        } catch (e) {
            console.error(`The error ${e} occured when using readStatus function from plugin.`);
        } finally {
            return {};
        }
    }

    return readFromStatus();
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
