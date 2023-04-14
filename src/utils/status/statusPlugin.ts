import { ReadStatusType, SaveStatusType } from '../../types';

export interface StatusPlugin {
    saveStatus: SaveStatusType;
    readStatus: ReadStatusType;
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
