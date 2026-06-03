## ADDED Requirements

### Requirement: Error toasts auto-dismiss
Error-level toast notifications SHALL automatically dismiss after 8 seconds. Users MAY also dismiss them immediately via the X close button.

#### Scenario: Error toast auto-dismisses after 8 seconds
- **WHEN** an error toast is displayed
- **THEN** it is automatically removed from the toast container after 8000ms

#### Scenario: Error toast can be dismissed manually
- **WHEN** the user clicks the X button on an error toast
- **THEN** the toast is immediately removed from the toast container

#### Scenario: Error toast timeout is cleaned up on manual dismiss
- **WHEN** the user manually dismisses an error toast before the 8-second timeout fires
- **THEN** the pending timeout is cancelled and no stale state update occurs

### Requirement: Info and warning toasts continue to auto-dismiss
Info and warning toasts SHALL continue to auto-dismiss after 3 seconds, maintaining existing behavior.

#### Scenario: Info toast auto-dismisses after 3 seconds
- **WHEN** an info toast is displayed
- **THEN** it is automatically removed after 3000ms

#### Scenario: Warning toast auto-dismisses after 3 seconds
- **WHEN** a warning toast is displayed
- **THEN** it is automatically removed after 3000ms

### Requirement: Toast timeout side-effects use useEffect with cleanup
All toast auto-dismiss timeouts SHALL be managed via `useEffect` with a cleanup function that calls `clearTimeout`, preventing duplicate timer scheduling on re-renders.

#### Scenario: Only one active timer per toast
- **WHEN** a toast component re-renders multiple times
- **THEN** only one auto-dismiss timer is active for that toast at any time

#### Scenario: Timer is cleaned up on unmount
- **WHEN** a toast component is unmounted before its auto-dismiss timer fires
- **THEN** the timer is cleared and no side-effects leak

### Requirement: Project path input trims whitespace on submit
The Settings panel's Project Path input SHALL trim leading and trailing whitespace from its value before sending the `set_project_path` configuration action to the server.

#### Scenario: Path with leading spaces is trimmed
- **WHEN** the user enters a project path with leading spaces and clicks "Set"
- **THEN** the value sent to the server has no leading spaces

#### Scenario: Path with trailing spaces is trimmed
- **WHEN** the user enters a project path with trailing spaces and clicks "Set"
- **THEN** the value sent to the server has no trailing spaces

#### Scenario: Path without surrounding whitespace is unchanged
- **WHEN** the user enters a project path without leading or trailing whitespace and clicks "Set"
- **THEN** the value sent to the server is identical to the input
