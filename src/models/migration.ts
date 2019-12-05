import { MigrationModule } from '../types';

export interface IMigration {
    name: string;
    module: MigrationModule;
}
