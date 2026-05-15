# Security Policy

AGF is pre-alpha. It has not been audited and ships **DEV-only** developer surfaces (the `/__agf/*` HTTP/WS bridge and the `window.__agf` global) that must never be exposed to untrusted networks. Reference backends have no auth or rate limiting.

If you find something that looks like a security issue, please open a **private security advisory** on GitHub: <https://github.com/MaxMinsk/AGF/security/advisories/new>. Don't post reproductions or details in public issues.

There is no bug bounty programme. AGF is single-maintainer pre-alpha work — response is best-effort.
