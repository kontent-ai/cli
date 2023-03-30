import { getRangeDate } from '../../../cmds/migration/run';

describe('test getRange', () => {
    const correctRanges = [
        {
            range: 'T2023:2024',
            expected: {
                from: new Date(Date.UTC(2023, 0)),
                to: new Date(Date.UTC(2024, 0)),
            },
        },
        {
            range: 'T2023-03:2024',
            expected: {
                from: new Date(Date.UTC(2023, 2)),
                to: new Date(Date.UTC(2024, 0)),
            },
        },
        {
            range: 'T2023-03:2024-05-23',
            expected: {
                from: new Date(Date.UTC(2023, 2)),
                to: new Date(Date.UTC(2024, 4, 23)),
            },
        },
        {
            range: 'T2023-03-05-09-05-20:2024-05-23',
            expected: {
                from: new Date(Date.UTC(2023, 2, 5, 9, 5, 20)),
                to: new Date(Date.UTC(2024, 4, 23)),
            },
        },
        {
            range: 'T2023-03-05-09-05-20:2023-03-05-09-05-21',
            expected: {
                from: new Date(Date.UTC(2023, 2, 5, 9, 5, 20)),
                to: new Date(Date.UTC(2023, 2, 5, 9, 5, 21)),
            },
        },
        {
            range: 'T2023-03-05-09-05-20:2023-03-05-09-05-20',
            expected: {
                from: new Date(Date.UTC(2023, 2, 5, 9, 5, 20)),
                to: new Date(Date.UTC(2023, 2, 5, 9, 5, 20)),
            },
        },
    ];

    test.each(correctRanges)('test $range to return correct object', ({ range, expected }) => {
        const result = getRangeDate(range);

        expect(result).toStrictEqual(expected);
    });

    const malformedRanges = ['T', '2023', 'T2023', 'T2023:', 'T2023:05:2024', 'T2023-13:2024', 'T2023-12:2023-12:02', 'T2023-1:2024', 'T2023-01-02-03-04-05:2023-01-02-03-04-04'];

    test.each(malformedRanges)('test %s to be null', (range) => {
        const result = getRangeDate(range);

        expect(result).toBeNull();
    });
});
