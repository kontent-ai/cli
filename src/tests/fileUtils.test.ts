import { getFileWithExtension, isAllowedExtension } from '../utils/fileUtils';

describe('File utils', () => {
    it('Returns file with extension when input has valid file extension', () => {
        const input = 'testFile.js';
        const result = getFileWithExtension(input);
        expect(result).toBe('testFile.js');
    });

    it('Returns file with extension even input has no file extension', () => {
        const input = 'testFile';
        const result = getFileWithExtension(input);
        expect(result).toBe('testFile.js');
    });

    it('File without extension is allowed', () => {
        const input = 'testFile';
        const result = isAllowedExtension(input);
        expect(result).toBe(true);
    });

    it('File with .JS extension is allowed', () => {
        const input = 'testFile.js';
        const result = isAllowedExtension(input);
        expect(result).toBe(true);
    });

    it('File with .TS extension is not allowed', () => {
        const input = 'testFile.ts';
        const result = isAllowedExtension(input);
        expect(result).toBe(false);
    });
});
