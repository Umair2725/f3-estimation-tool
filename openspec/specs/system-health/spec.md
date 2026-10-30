# system-health Specification

## Purpose

Lets people and infrastructure check whether the F3 Estimation Tool is running and can reach its database, and makes the system refuse to start with an invalid configuration instead of failing later in confusing ways.

## Requirements

### Requirement: Health check reports overall status
The system SHALL expose an unauthenticated health check at `GET /api/health` that responds with JSON containing an overall `status` of `ok` or `error`, the application version, and the current server time.

#### Scenario: Healthy system
- **WHEN** the application is running and the database is reachable
- **AND** a client sends `GET /api/health`
- **THEN** the response status is 200
- **AND** the body contains `"status": "ok"`, a non-empty `version`, and a `time` in ISO 8601 format

### Requirement: Health check verifies the database
The health check SHALL verify the database connection on every call and report it as a separate `database` component with status `ok` or `error`.

#### Scenario: Database reachable
- **WHEN** the database accepts a simple query
- **THEN** the body contains `"database": { "status": "ok" }`

#### Scenario: Database unreachable
- **WHEN** the database cannot be reached or does not answer within 3 seconds
- **THEN** the response status is 503
- **AND** the body contains `"status": "error"` and `"database": { "status": "error" }`

### Requirement: Health check exposes no sensitive data
The health check response MUST NOT include secrets, connection strings, hostnames, stack traces, or raw error messages from the database.

#### Scenario: Error details hidden
- **WHEN** the database check fails with an internal error message
- **THEN** the response body contains only the component status and a generic message such as `"database unavailable"`
- **AND** the full error is written to the server log instead

### Requirement: Required database extensions are present
The health check SHALL confirm that the vector-search extension needed by later features is installed in the database, and report the database as `error` when it is missing.

#### Scenario: Extension missing
- **WHEN** the database is reachable but the vector extension is not installed
- **THEN** the response status is 503
- **AND** the body reports `"database": { "status": "error" }` with the message `"required extension missing"`

### Requirement: Configuration is validated at startup
The system SHALL validate its required configuration when it starts, and MUST refuse to start if any required setting is missing or invalid, naming each problem setting without printing its value.

#### Scenario: Missing setting
- **WHEN** the application starts without a required setting, such as the database URL
- **THEN** startup stops with a non-zero exit code
- **AND** the log names the missing setting

#### Scenario: Invalid setting
- **WHEN** a setting has an invalid format, such as a database URL that is not a PostgreSQL URL
- **THEN** startup stops with a non-zero exit code
- **AND** the log names the invalid setting without printing its value

#### Scenario: Valid configuration
- **WHEN** all required settings are present and valid
- **THEN** the application starts and the health check is reachable
