## ADDED Requirements

### Requirement: Server startup and shutdown
The web server SHALL start on a configurable port when dscode is launched with `--web` flag, and SHALL gracefully shut down on SIGINT/SIGTERM.

#### Scenario: Default port
- **WHEN** user runs `dscode --web` without specifying a port
- **THEN** the web server starts on port 3000 and logs the URL to console

#### Scenario: Custom port
- **WHEN** user runs `dscode --web --port 8080`
- **THEN** the web server starts on port 8080

#### Scenario: Graceful shutdown
- **WHEN** the server process receives SIGINT
- **THEN** all WebSocket connections are closed, the HTTP server stops, and the Harness shutdown sequence runs

### Requirement: Static file serving
The server SHALL serve the SPA frontend assets (HTML, JS, CSS, images) from the built `dist/web/` directory.

#### Scenario: Root path returns index.html
- **WHEN** browser requests `GET /`
- **THEN** server responds with `dist/web/index.html` and `Content-Type: text/html`

#### Scenario: Asset file serving
- **WHEN** browser requests `GET /assets/index-abc123.js`
- **THEN** server responds with the corresponding file from `dist/web/assets/` and correct `Content-Type`

#### Scenario: SPA fallback
- **WHEN** browser requests an unknown path like `GET /chat/session-1`
- **THEN** server responds with `dist/web/index.html` (to support client-side routing)

### Requirement: WebSocket upgrade
The server SHALL accept WebSocket upgrade requests at `/ws` path and maintain persistent connections for real-time communication.

#### Scenario: Successful WebSocket connection
- **WHEN** a client sends a WebSocket upgrade request to `/ws`
- **THEN** the server accepts the upgrade and sends a `{"type":"ready"}` event along with initial model and config state

#### Scenario: Connection tracking
- **WHEN** a WebSocket connection is established
- **THEN** the server associates that connection with the Harness instance and routes all UI events to it

### Requirement: REST configuration endpoints
The server SHALL provide REST endpoints for fetching and updating configuration that does not require streaming.

#### Scenario: Get current config
- **WHEN** client sends `GET /api/config`
- **THEN** server responds with JSON containing current model, thinking level, API key (masked), and project path

#### Scenario: Get sessions list
- **WHEN** client sends `GET /api/sessions`
- **THEN** server responds with JSON array of session metadata (id, title, date, messageCount)

#### Scenario: Get current conversation history
- **WHEN** client sends `GET /api/conversation`
- **THEN** server responds with JSON array of all messages in the current session

### Requirement: UiBackend interface abstraction
The Harness SHALL depend on a `UiBackend` interface rather than a concrete TUI implementation, allowing different UI backends to be plugged in.

#### Scenario: CLI mode uses TuiBackend
- **WHEN** dscode starts without `--web` flag
- **THEN** the Harness creates and uses a `TuiBackend` instance (wrapping existing `TuiApp`)

#### Scenario: Web mode uses WebUiBackend
- **WHEN** dscode starts with `--web` flag
- **THEN** the Harness creates and uses a `WebUiBackend` instance

#### Scenario: All UiBackend methods are called correctly
- **WHEN** the Agent produces any UI event (text delta, tool call, permission prompt, etc.)
- **THEN** the corresponding UiBackend method is invoked with the correct parameters
