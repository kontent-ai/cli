export interface IMigrationStatus {
    readonly name: string;
    readonly success: boolean;
    readonly order: number | Date;
    readonly time: Date;
    readonly lastOperation?: Operation;
}

export interface IStatus {
    [projectId: string]: IMigrationStatus[];
}

export type Operation = 'run' | 'rollback';
