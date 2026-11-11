import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// Runs once before all test files: a fresh test database with the real schema.

function databaseName() {
    const name = process.env.DB_NAME ?? '';
    // Safety net: never drop a database that isn't clearly a test database.
    if (!name.endsWith('_test')) {
        throw new Error(`Refusing to use "${name}" for tests: the name must end with _test`);
    }
    return name;
}

function connect(database: string) {
    return new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database,
    });
}

async function dropDatabase(name: string) {
    const admin = connect('postgres');
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
}

export async function setup() {
    const name = databaseName();
    await dropDatabase(name);

    const admin = connect('postgres');
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}"`);
    await admin.end();

    const db = connect(name);
    await db.connect();
    await db.query(readFileSync('db/schema.sql', 'utf8'));
    await db.end();
}

export async function teardown() {
    await dropDatabase(databaseName());
}
