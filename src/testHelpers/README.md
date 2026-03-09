# Test Helpers

This directory contains utility functions for testing the database module.

## Database Test Helper

The `dbTestHelper.js` file provides utilities for creating and cleaning up test databases.

### Functions

#### `createTestDb()`

Creates an in-memory test database with all required tables initialized.

**Returns:** `Database` - An in-memory database instance

**Example:**
```javascript
const { createTestDb, cleanupTestDb } = require('../testHelpers/dbTestHelper');

let db;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  cleanupTestDb(db);
});
```

#### `createTestDbFile(testName)`

Creates a test database in a temporary file location.

**Parameters:**
- `testName` (string) - Name of the test (used for unique file naming)

**Returns:** `{ db, dbPath }` - Object containing database instance and file path

**Example:**
```javascript
const { createTestDbFile, cleanupTestDb } = require('../testHelpers/dbTestHelper');

let db, dbPath;

beforeEach(() => {
  const result = createTestDbFile('mytest');
  db = result.db;
  dbPath = result.dbPath;
});

afterEach(() => {
  cleanupTestDb(db, dbPath);
});
```

#### `cleanupTestDb(db, dbPath)`

Closes the database connection and optionally deletes the database file.

**Parameters:**
- `db` (Database) - Database instance to close
- `dbPath` (string, optional) - Path to database file to delete

**Example:**
```javascript
cleanupTestDb(db); // For in-memory databases
cleanupTestDb(db, dbPath); // For file-based databases
```

#### `cleanupAllTestDbs()`

Cleans up all test database files in the temp directory.

**Example:**
```javascript
afterAll(() => {
  cleanupAllTestDbs();
});
```

## Usage in Tests

All test files should use these helpers to ensure proper database isolation and cleanup:

1. Import the helpers at the top of your test file
2. Use `createTestDb()` in `beforeEach()` to create a fresh database for each test
3. Use `cleanupTestDb()` in `afterEach()` to clean up after each test
4. Optionally use `cleanupAllTestDbs()` in `afterAll()` to ensure all temp files are removed

This approach ensures:
- Each test runs with a clean database state
- Tests don't interfere with each other
- No leftover database files after tests complete
- Fast test execution using in-memory databases
