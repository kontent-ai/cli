import { loadStatusPlugin } from '../../utils/status/statusPlugin';

describe('status plugin tests', () => {
    const saveStatus = () => {};
    const readStatus = () => ({});

    jest.mock(
        'plugin',
        () => ({
            saveStatus,
            readStatus,
        }),
        { virtual: true }
    );

    jest.mock(
        'malformedPlugin',
        () => ({
            save: saveStatus,
            read: readStatus,
        }),
        { virtual: true }
    );

    it('test correct plugin', async () => {
        const functions = await loadStatusPlugin('plugin');

        expect(functions.saveStatus).toEqual(saveStatus);
        expect(functions.readStatus).toEqual(readStatus);
    });

    it('test malformed plugin', async () => {
        expect(loadStatusPlugin('malformedPlugin')).rejects.toThrow();
    });
});
