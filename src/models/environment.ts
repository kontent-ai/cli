export interface IEnvironment {
    readonly projectId: string;
    readonly apiKey: string;
}

export interface IEnvironmentsConfig {
    [index: string]: IEnvironment;
}
