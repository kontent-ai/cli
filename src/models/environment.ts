export interface IEnvironment {
    readonly environmentId: string;
    readonly apiKey: string;
}

export interface IEnvironmentsConfig {
    [index: string]: IEnvironment;
}
