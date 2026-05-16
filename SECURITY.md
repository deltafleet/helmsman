# Security Policy

## Supported Versions

Security fixes target the latest release on `main`.

## Reporting a Vulnerability

Do not open a public issue for secrets, credential leaks, or execution-safety vulnerabilities.

Report privately through GitHub Security Advisories for this repository when available. If advisories are not available, contact the maintainer through the GitHub profile associated with the repository and include:

- affected version or commit
- reproduction steps
- expected impact
- whether any token, credential, or private transcript may have been exposed

## Sensitive Data

Do not commit local Codex profiles, `.helmsman/` session state, GitHub tokens, raw chat transcripts, SQLite state, local cache directories, or generated `codex-home` folders. The repository `.gitignore` excludes these by default.
