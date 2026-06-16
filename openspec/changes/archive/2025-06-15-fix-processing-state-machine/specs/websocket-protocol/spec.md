## ADDED Requirements

### Requirement: Permission response with modified prompt
The protocol SHALL support a `permission_response` command type that allows the client to respond to a permission prompt by providing a modified text prompt (e.g., user explanation, alternative instruction) instead of a direct allow/deny decision. The server SHALL treat this as a denial of the original tool with the user's explanation text forwarded as a new user message for the agent to process. The `permission_response` handler SHALL NOT fall through into the `permission` handler.

#### Scenario: Client responds to permission prompt with modified text
- **WHEN** client sends `{"type":"permission_response","decision":"deny","denyReason":"Use a different approach that doesn't require file deletion"}`
- **THEN** server resolves the pending permission with `decision: "deny"`, broadcasts the user's explanation as a `user_message` event, and prompts the agent with the explanation text

#### Scenario: Permission response does not create persistent rules
- **WHEN** client sends a `permission_response` command
- **THEN** server does NOT create any persistent permission rules, session grants, or tool name patterns; only the `permission` command type triggers rule creation

#### Scenario: Permission response does not execute when no permission is pending
- **WHEN** client sends a `permission_response` command but no permission prompt is pending (`permissionResolve` is null)
- **THEN** server silently ignores the command with no error
