import { IStatus } from '../../models/status';

export interface StatusPlugin {
    saveStatus: (data: string) => Promise<void>;
    readStatus: () => Promise<IStatus>;
}

export const loadStatusPlugin = async (path: string): Promise<StatusPlugin> => {
    const pluginModule = await import(path);

    if (!('saveStatus' in pluginModule && typeof pluginModule.saveStatus === 'function') || !('readStatus' in pluginModule && typeof pluginModule.readStatus === 'function')) {
        throw new Error('Invalid plugin: does not implement saveStatus or readStatus functions');
    }

    return {
        saveStatus: pluginModule.saveStatus,
        readStatus: pluginModule.readStatus,
    };
};
