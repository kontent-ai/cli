import { IStatus } from '../../models/status';

interface StatusPlugin {
    saveStatusToFile: (data: string) => void;
    readStatusFromFile: () => IStatus;
}

export const loadStatusPlugin = async (path: string): Promise<StatusPlugin> => {
    const pluginModule = await import(path);

    if (!('saveStatusToFile' in pluginModule && typeof pluginModule.saveStatusToFile === 'function') || !('readStatusFromFile' in pluginModule && typeof pluginModule.readStatusFromFile === 'function')) {
        throw new Error('Invalid plugin: does not implement saveStatusToFile or readStatusFromFile functions');
    }

    return {
        saveStatusToFile: pluginModule.saveStatusToFile,
        readStatusFromFile: pluginModule.readStatusFromFile,
    };
};
