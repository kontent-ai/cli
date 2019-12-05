import {
    generatePlainMigration,
    generateTypedMigration
} from '../utils/migrationUtils';

describe('Migration generation', () => {
    it('Creates new typescript migration with name', () => {
        const migrationContent = generateTypedMigration();
        expect(migrationContent).toMatchSnapshot();
    });

    it('Creates new javascript migration with name', () => {
        const migrationContent = generatePlainMigration();

        expect(migrationContent).toMatchSnapshot();
    });
});
