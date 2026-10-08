# Security Policy

## Supported versions

Only the latest published release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue for security reports. Use GitHub's private
vulnerability reporting: open the repository's **Security** tab and choose
**Report a vulnerability**. Reports are triaged privately and credited at the
reporter's discretion.

## What matters most here

Atrium is a desktop app that observes local repositories and invokes commands
those repositories already own. Reports in these areas are especially
valuable:

- anything that lets manifest declarations, repository files, or workspace
  paths escape their declared boundary (path traversal, symlink escapes,
  canonicalization mismatch);
- command execution that goes beyond `program + args + working directory`,
  such as shell string interpolation of untrusted input;
- the Check / Build / Run boundary: commands must only execute on hosts the
  profile declares, and Git operations must stay read-only;
- local data handling: run records, logs, and preferences must stay inside
  Atrium's own storage and must not leak into project repositories.

## Disclosure

Fixes are released as soon as practical and credited in the release notes
unless the reporter prefers otherwise.
