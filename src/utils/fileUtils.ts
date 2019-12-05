import fs, { Dirent, PathLike } from 'fs';
import { getMigrationDirectory } from './migrationUtils';

export const listFiles = (fileExtension: string): Dirent[] => {
    return fs
        .readdirSync(getMigrationDirectory(), { withFileTypes: true })
        .filter(f => f.isFile())
        .filter(f => f.name.endsWith(fileExtension));
};

export const fileExists = (filePath: PathLike): boolean => {
    return fs.existsSync(filePath);
};
