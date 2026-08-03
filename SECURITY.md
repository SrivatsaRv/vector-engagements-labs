# Security policy

## Supported versions

Until the first stable release, only the latest commit on `main` and the latest tagged prerelease receive security fixes.

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose credentials, modify saved-run integrity, execute code, bypass access controls, poison provenance, or compromise a deployment. Use GitHub's private vulnerability reporting for this repository. If that feature is unavailable, contact the repository owner privately through their GitHub profile and request a secure reporting channel.

Include the affected commit or release, deployment assumptions, reproduction steps, impact, and any suggested mitigation. Do not include real credentials, operational data, or third-party personal data.

Maintainers should acknowledge a complete report within five working days, validate severity, coordinate a fix and disclosure window, and credit the reporter unless anonymity is requested.

## Security boundaries

- Browser simulation output is not an operational prediction.
- Public catalog data and model assumptions are not secrets.
- Deployment credentials, database URLs, API tokens, signing keys, and private telemetry are secrets.
- Saved records require integrity checks but are not digitally signed evidence in the current release.
- Third-party datasets and model coefficients require provenance and license review before merge.
