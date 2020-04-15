export interface IMigrationStatus {
    readonly name: string;
    readonly success: boolean;
    readonly order: number;
    readonly time: Date;
}

export interface IStatus {
    [projectId: string]: IMigrationStatus[];
}
