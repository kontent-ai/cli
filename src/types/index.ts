import { IManagementClient } from '@kentico/kontent-management';

export declare interface MigrationModule {
    readonly order: number;
    run(apiClient: IManagementClient): Promise<void>;
}
