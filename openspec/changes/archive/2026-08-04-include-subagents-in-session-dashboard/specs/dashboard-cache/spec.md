## ADDED Requirements

### Requirement: Dashboard content hash includes SubAgent records
The Session `contentHash` used for Dashboard cache validation SHALL be derived from a
stable projection of both Main Agent messages and persisted `agentMessages`, plus a
Dashboard format-version marker.

#### Scenario: SubAgent completion invalidates current Session cache
- **WHEN** a SubAgent terminal record is added to the current Session without changing Main Agent messages
- **THEN** the Session `contentHash` changes on save
- **AND** a Dashboard cache entry created before the SubAgent completion no longer matches

#### Scenario: Background completion invalidates non-current Session cache
- **WHEN** a background SubAgent terminal record is upserted into a Session that is not currently visible
- **THEN** that stored Session's metadata receives a new `contentHash`
- **AND** loading that Session and switching to Dashboard triggers regeneration instead of using the older cached artifact

#### Scenario: Stable data produces stable hash
- **WHEN** Main Agent messages and `agentMessages` are unchanged across repeated saves
- **THEN** the computed `contentHash` remains identical

#### Scenario: SubAgent outcome affects hash
- **WHEN** two otherwise identical Agent records differ in Application, state, timing, input summary, output, or error
- **THEN** their Dashboard content hashes differ

#### Scenario: Legacy Session without Agent records
- **WHEN** a v1 or v2 Session has no `agentMessages`
- **THEN** Dashboard content hashing succeeds with an empty Agent record projection
- **AND** no Session format migration is required solely to compute the hash

#### Scenario: Dashboard presentation contract changes
- **WHEN** the Dashboard format-version marker changes
- **THEN** the Session `contentHash` changes even if Main messages and `agentMessages` are unchanged
- **AND** cached HTML generated under the previous presentation contract is regenerated
