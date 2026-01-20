#!/usr/bin/env node
import sql from 'mssql';
import { randomUUID } from 'crypto';

const isDevelopment = process.env.ASPNETCORE_ENVIRONMENT === 'Development';

const config = {
  server: process.env.DB_SERVER || 'sql',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'AppDb',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'LocalDev123!',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const API_URL = process.env.API_URL || 'http://localhost:5166';

async function emulateUser(employeeId, options = {}) {
  const {
    kerberos = `user${employeeId}`,
    iamId = `iam${employeeId}`,
    displayName = `Test User ${employeeId}`,
    email = `${kerberos}@ucdavis.edu`,
  } = options;

  let pool;
  try {
    pool = await sql.connect(config);

    // Check if user exists
    const existing = await pool.request()
      .input('employeeId', sql.NVarChar, employeeId)
      .query('SELECT Id, EmployeeId, DisplayName FROM Users WHERE EmployeeId = @employeeId');

    if (existing.recordset.length > 0) {
      console.log(`User exists: ${existing.recordset[0].DisplayName} (${employeeId})`);
    } else if (isDevelopment) {
      // Only create user in development environment
      const userId = randomUUID();
      await pool.request()
        .input('id', sql.UniqueIdentifier, userId)
        .input('kerberos', sql.NVarChar, kerberos)
        .input('iamId', sql.NVarChar, iamId)
        .input('employeeId', sql.NVarChar, employeeId)
        .input('displayName', sql.NVarChar, displayName)
        .input('email', sql.NVarChar, email)
        .query(`
          INSERT INTO Users (Id, Kerberos, IamId, EmployeeId, DisplayName, Email, IsActive)
          VALUES (@id, @kerberos, @iamId, @employeeId, @displayName, @email, 1)
        `);
      console.log(`Created user: ${displayName} (${employeeId})`);
    } else {
      console.error(`User not found and cannot create: not in Development environment`);
      console.error(`Set ASPNETCORE_ENVIRONMENT=Development to allow user creation`);
      process.exit(1);
    }

    const emulateUrl = `${API_URL}/api/system/emulate/${employeeId}`;
    console.log(`\nEmulate URL:\n${emulateUrl}\n`);

    return emulateUrl;
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
  }
}

// Parse command line args
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`Usage: npm run emulate <employeeId> [options]

Options:
  --kerberos=<kerberos>     Kerberos ID (default: user<employeeId>)
  --name=<name>             Display name (default: Test User <employeeId>)
  --email=<email>           Email (default: <kerberos>@ucdavis.edu)

Examples:
  npm run emulate 1000
  npm run emulate 1000 --name="John Doe" --kerberos=jdoe

Note: User creation only works when ASPNETCORE_ENVIRONMENT=Development
`);
  process.exit(0);
}

const employeeId = args[0];
const options = {};

for (const arg of args.slice(1)) {
  if (arg.startsWith('--kerberos=')) options.kerberos = arg.split('=')[1];
  if (arg.startsWith('--name=')) options.displayName = arg.split('=')[1];
  if (arg.startsWith('--email=')) options.email = arg.split('=')[1];
  if (arg.startsWith('--iam=')) options.iamId = arg.split('=')[1];
}

emulateUser(employeeId, options);
