import fs, { PathLike } from 'fs';
import * as path from 'path';

export const fileExists = (filePath: PathLike): boolean => {
    return fs.existsSync(filePath);
};

export const isAllowedExtension = (filename: string): boolean => {
    const extension = path.extname(filename);
    return ['.js', ''].includes(extension);
};

export const getFileWithExtension = (filename: string, defaultExtension: string = '.js'): string => {
    const hasFileExtension = path.extname(filename);

    if (hasFileExtension) {
        const normalized = filename.split(defaultExtension).slice(0, -1).join(defaultExtension);
        return normalized + defaultExtension;
    } else {
        return filename + defaultExtension;
    }
};

export const getFileBackupName = () => {
    const currentDate = new Date();
    const formatted = `${currentDate.getFullYear()}-${currentDate.getMonth()}-${currentDate.getDate()}-${currentDate.getTime()}`;
    return `backup-${formatted}`;
};
