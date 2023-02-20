import { ManagementClient } from '@kontent-ai/management-sdk';

export declare interface MigrationModule {
    readonly order: number | Date;
    run(apiClient: ManagementClient): Promise<void>;
}
