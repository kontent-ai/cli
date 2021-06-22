import { getDuplicates } from '../utils/migrationUtils';

describe('Detection of duplicate orders', () => {
    it('Finds duplicates migration', () => {
        const migrations = [
            {
                module: {
                    order: 1,
                    name: 'test',
                },
            },
            {
                module: {
                    order: 2,
                    name: 'test',
                },
            },
            {
                module: {
                    order: 1,
                    name: 'test',
                },
            },
        ];

        const result = getDuplicates(migrations, (opt) => opt.module.order);

        expect(result.length).toBe(2);
    });

    it('No duplicate migration is found', () => {
        const migrations = [
            {
                module: {
                    order: 1,
                    name: 'test',
                },
            },
            {
                module: {
                    order: 2,
                    name: 'test',
                },
            },
            {
                module: {
                    order: 3,
                    name: 'test',
                },
            },
        ];

        const result = getDuplicates(migrations, (opt) => opt.module.order);

        expect(result.length).toBe(0);
    });
});
