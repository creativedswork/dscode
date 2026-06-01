## MODIFIED Requirements

### Requirement: Slash command support via WebSocket
The protocol SHALL support slash commands (e.g., `/help`, `/reset`, `/config`) through the `chat` command channel. The server SHALL inspect the text of each `chat` command: if the text starts with `/` and the first word matches a known slash command, the server SHALL execute the command; otherwise the text SHALL be treated as a regular chat message to the AI. Unknown or unrecognized `/`-prefixed text SHALL be silently forwarded as chat input without an error event.

#### Scenario: Slash command execution via chat
- **WHEN** client sends `{"type":"chat","text":"/config model deepseek-v4-pro"}`
- **THEN** server recognizes the first word `config` as a known slash command, executes it, and sends result events

#### Scenario: File path sent as chat
- **WHEN** client sends `{"type":"chat","text":"/Users/foo/bar.ts"}`
- **THEN** server does not recognize `Users/foo/bar.ts` as a known slash command, and sends the text as a regular user message to the AI

#### Scenario: Unknown slash-like text forwarded to AI
- **WHEN** client sends `{"type":"chat","text":"/randomstuff"}`
- **THEN** server does not recognize `randomstuff` as a known slash command, forwards the text as a regular user message to the AI, and does NOT send an error event

#### Scenario: Slash command list for autocomplete
- **WHEN** client requests the available slash commands
- **THEN** server responds with the list of command names and descriptions
