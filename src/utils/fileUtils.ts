import fs, { Dirent, PathLike } from 'fs';
import { getMigrationDirectory } from './migrationUtils';
import * as path from 'path';

export const listFiles = (fileExtension: string): Dirent[] => {
    return fs
        .readdirSync(getMigrationDirectory(), { withFileTypes: true })
        .filter(f => f.isFile())
        .filter(f => f.name.endsWith(fileExtension));
};

export const fileExists = (filePath: PathLike): boolean => {
    return fs.existsSync(filePath);
};

export const isAllowedExtension = (filename: string): boolean => {
    const extension = path.extname(filename);
    return ['.js', ''].includes(extension);
};

export const getFileWithExtension = (
    filename: string,
    defaultExtension: string = '.js'
): string => {
    const hasFileExtension = path.extname(filename);

    if (hasFileExtension) {
        const normalized = filename
            .split(defaultExtension)
            .slice(0, -1)
            .join(defaultExtension);
        return normalized + defaultExtension;
    } else {
        return filename + defaultExtension;
    }
};
