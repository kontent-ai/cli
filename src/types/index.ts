import { ManagementClient } from '@kontent-ai/management-sdk';
import { IStatus } from '../models/status';

export declare interface MigrationModule {
    readonly order: number | Date;
    run(apiClient: ManagementClient): Promise<void>;
}

export type SaveStatusType = (data: string) => Promise<void>;
export type ReadStatusType = () => Promise<IStatus>;
