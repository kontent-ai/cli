import { ManagementClient } from '@kontent-ai/management-sdk';

export declare interface MigrationModule {
    readonly order: number;
    run(apiClient: ManagementClient): Promise<void>;
}
