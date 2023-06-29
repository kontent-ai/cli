import { IMigrationStatus, IStatus, Operation } from '../models/status';
import { readFileSync, writeFileSync } from 'fs';
import { fileExists } from './fileUtils';
import * as path from 'path';
import { type StatusPlugin } from './status/statusPlugin';

const migrationStatusFilename = 'status.json';
const pluginsFilename = 'plugins.js';

const updateMigrationStatus = async (status: IStatus, environmentId: string, migrationStatus: IMigrationStatus, saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
    status[environmentId] = status[environmentId] === undefined ? [] : status[environmentId];
    const environmentsMigrationsHistory = status[environmentId];

    const previousMigrationStatusIndex = environmentsMigrationsHistory.findIndex((executedMigration) => executedMigration.name === migrationStatus.name);
    if (previousMigrationStatusIndex > -1) {
        environmentsMigrationsHistory[previousMigrationStatusIndex] = migrationStatus;
    } else {
        environmentsMigrationsHistory.push(migrationStatus);
    }

    await saveStatusFile(status, saveStatusFromPlugin);
};

export const markAsCompleted = async (status: IStatus, environmentId: string, name: string, order: number | Date, operation: Operation, saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
    const migrationStatus: IMigrationStatus = {
        name,
        order,
        success: true,
        time: new Date(Date.now()),
        lastOperation: operation,
    };

    await updateMigrationStatus(status, environmentId, migrationStatus, saveStatusFromPlugin);
};

const saveStatusFile = async (migrationsStatus: IStatus, saveStatusFromPlugin: StatusPlugin['saveStatus'] | null) => {
    const statusJSON = JSON.stringify(migrationsStatus, null, 2);

    if (saveStatusFromPlugin) {
        try {
            await saveStatusFromPlugin(statusJSON);
            return;
        } catch (e) {
            console.error(`The error ${e} occured when using saveStatus function from plugin. Fallbacking to write status into status.json`);
            saveStatusToFile(statusJSON);
            throw new Error((e as Error).message);
        }
    }

    saveStatusToFile(statusJSON);
};

const getMigrationStatus = (migrationsStatus: IStatus, migrationName: string, environmentId: string): IMigrationStatus | null => {
    const environmentStatus = migrationsStatus[environmentId];

    return environmentStatus === undefined ? null : environmentStatus.find((migrationStatus) => migrationStatus.name === migrationName) ?? null;
};

export const shouldSkipMigration = (migrationsStatus: IStatus, migrationName: string, environmentId: string, operation: Operation): boolean => {
    const migrationStatus = getMigrationStatus(migrationsStatus, migrationName, environmentId);

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
        return await readStatusFromPlugin();
    }

    return readFromStatus();
};

const readFromStatus = (): IStatus => {
    const statusFilepath = getStatusFilepath();
    if (!fileExists(statusFilepath)) {
        return {};
    }

    try {
        const environmentsMigrationStatuses = readFileSync(getStatusFilepath()).toString();

        return JSON.parse(environmentsMigrationStatuses);
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
