import { ManagementClient } from '@kentico/kontent-management';

export declare interface MigrationModule {
    readonly order: number;
    run(apiClient: ManagementClient): Promise<void>;
}
