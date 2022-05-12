import { getMigrationsWithInvalidOrder } from '../utils/migrationUtils';

describe('Detection of invalid orders', () => {
    it('Finds migrations with invalid order', () => {
        const migrations = [
            {
                module: {
                    order: -1,
                },
                name: 'test',
            },
            {
                module: {
                    order: 1.1,
                },
                name: 'test',
            },
            {
                module: {
                    order: 2,
                },
                name: 'test',
            },
            {
                module: {
                    order: 'aaa',
                },
                name: 'test',
            },
        ];

        const result = getMigrationsWithInvalidOrder(migrations);

        expect(result.length).toBe(3);
        expect(result[0].module.order).toBe(-1);
        expect(result[1].module.order).toBe(1.1);
        expect(result[2].module.order).toBe('aaa');
    });

    it('No invalid order is found', () => {
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
                    order: 6,
                    name: 'test',
                },
            },
            {
                module: {
                    order: 7,
                    name: 'test',
                },
            },
        ];

        const result = getMigrationsWithInvalidOrder(migrations);

        expect(result.length).toBe(0);
    });
});
