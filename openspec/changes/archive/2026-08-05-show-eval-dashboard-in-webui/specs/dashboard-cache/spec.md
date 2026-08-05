## ADDED Requirements

### Requirement: Eval Dashboard cache is isolated from Session Dashboard cache

The frontend SHALL persist completed Eval Dashboard artifacts under a separate `dscode-eval-dash-cache` localStorage key. Eval entries SHALL NOT be written into, read from or evict entries from `dscode-dash-cache`.

Each Eval entry SHALL contain `formatVersion`, `targetSessionId`, `runId`, `generatedAt` and complete `html`, and SHALL be keyed by the immutable `${targetSessionId}:${runId}` identity.

#### Scenario: Completed Eval is cached

- **WHEN** WebUI receives a completed Eval Dashboard event for target A and run R
- **THEN** it SHALL store the artifact under key `A:R` in `dscode-eval-dash-cache`
- **AND** SHALL leave the Session Dashboard cache unchanged

#### Scenario: Same target has multiple runs

- **WHEN** completed runs R1 and R2 both target Session A
- **THEN** the cache SHALL retain distinct `A:R1` and `A:R2` entries until normal Eval cache eviction
- **AND** reopening R1 SHALL render R1's immutable HTML

### Requirement: Failed and running Eval events do not overwrite success

Only a completed Eval Dashboard event SHALL write HTML into the Eval cache. Running or failed lifecycle states SHALL preserve the most recent successful artifact.

#### Scenario: New run fails

- **WHEN** a completed report for run R1 is cached and later run R2 fails
- **THEN** R1 SHALL remain available as the latest successful report
- **AND** no completed cache entry SHALL be created for R2
- **AND** R1 SHALL be automatically displayed only when R1 and R2 have the same `targetSessionId`

#### Scenario: Another target has a newer successful report

- **WHEN** run R2 for target A fails and the globally newest cached report belongs to target B
- **THEN** the target B report SHALL NOT be displayed as fallback for R2
- **AND** WebUI SHALL select the newest completed report for target A by `generatedAt`
- **AND** if target A has no completed report, WebUI SHALL display no Dashboard

#### Scenario: New run is still running

- **WHEN** run R2 is running while R1 is the latest successful report
- **THEN** the UI MAY display R2 progress
- **AND** SHALL retain R1 HTML without mutation

### Requirement: Eval Dashboard cache is bounded and versioned

The Eval Dashboard cache SHALL retain at most five most-recently-accessed entries. Entries with an unsupported `formatVersion`, invalid identity or missing HTML SHALL be ignored and removed during cache normalization.

#### Scenario: Sixth Eval report is cached

- **WHEN** five valid Eval entries exist and a sixth completed report is stored
- **THEN** the least-recently-accessed Eval entry SHALL be evicted
- **AND** Session Dashboard cache entries SHALL not count toward this limit

#### Scenario: Eval cache survives reload

- **WHEN** WebUI reloads with a valid Eval cache
- **THEN** it SHALL restore the latest Eval artifact metadata
- **AND** make the Eval view available without regenerating the report

#### Scenario: Unsupported Eval cache version

- **WHEN** an Eval cache entry has a format version unsupported by the current frontend
- **THEN** WebUI SHALL not render that HTML
- **AND** SHALL remove or ignore the invalid entry without affecting Session Dashboard cache
