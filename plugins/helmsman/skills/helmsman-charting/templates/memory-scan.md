# Memory Scan

## Rule

Broad Memory Scan is forbidden before the first Aperture Question Bundle. The first question bundle creates the search coordinates.

Scoped Memory Scan happens before Research Lanes. Research is allowed only for route-changing uncertainty that prior memory cannot settle.

## C-001 Scoped Memory Scan

Selected aperture:
<user-approved search coordinates>

Prior memory sources checked:
- <wiki index, session artifact, promoted memory, or none found>

| Candidate | Source | Judgment | Reason | Route Effect | Research Needed | Research Lane |
| --- | --- | --- | --- | --- | --- | --- |
| <memory candidate> | <path> | reused | <still valid and applicable> | <route effect> | no | none |
| <memory candidate> | <path> | stale | <outdated or architecture mismatch> | <route effect> | yes | <research-slug> |
| <memory candidate> | <path> | irrelevant | <related but not useful here> | none | no | none |
| <missing candidate> | none | missing | <no prior memory found> | <route effect> | yes | <research-slug> |
| <memory conflict> | <paths> | conflict | <incompatible prior claims> | <route effect> | yes | <research-slug> |

Allowed judgments:

```text
reused | stale | irrelevant | missing | conflict
```

## Research Lane Output

Only `stale`, `missing`, and `conflict` judgments may create Research Lanes.
