# Security Policy

## Scope

ACKS God Mode is a **client-side, single-HTML-file** application. It runs entirely in
your browser, and your campaign data never leaves your machine — saves go directly to
your local disk via the File System Access API (or via download in Firefox/Safari).
There is **no server, no account, and no backend**, so the usual web-app attack surface
(authentication, databases, server-side injection) does not apply.

The realistic attack surface is small but worth reporting against:

- **Malicious `.acks.json` saves.** The tool parses user-supplied campaign files. A
  crafted save that triggers code execution, breaks out of the data model, or causes a
  cross-site-scripting (XSS) issue when rendered would be a real vulnerability.
- **Cross-site scripting (XSS)** from any campaign-supplied text rendered in the UI.
- **Dependency / supply-chain issues.** Alpine.js and Tailwind CSS are vendored under
  `vendor/` as pinned, same-origin copies (there are no remote `<script src>` tags, so a
  compromised CDN can't run code here), backed by a baseline Content-Security-Policy.
  Subresource-Integrity hashes are **omitted by design**: SRI forces a CORS fetch that a
  `file://` document (opaque origin) can't satisfy — it would blank the page in the tool's
  single-file distribution mode — and is redundant for a same-origin vendored asset anyway
  (an attacker who could rewrite the local bundle could equally rewrite `index.html`). A way
  to get third-party code to run despite the vendoring + CSP would be in scope.

## Supported versions

This is an actively developed solo project with a rolling release. **Only the latest
release** (see the [Releases](https://github.com/joachimxb/acks-god-mode/releases) page)
is supported for security fixes. If you're running an older build, please reproduce on
the latest release before reporting.

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.** Report it privately:

1. Go to the repository's **[Security tab → "Report a vulnerability"](https://github.com/joachimxb/acks-god-mode/security/advisories/new)**
   (GitHub's private vulnerability reporting). This keeps the report confidential until a
   fix is available.
2. If private reporting isn't available to you for some reason, open a regular issue that
   says only *"security report — please enable private reporting / contact me"* with **no
   technical details**, and the maintainer will set up a private channel.

Please include, as you would for any bug:

- A description of the issue and its impact.
- Steps to reproduce (and a minimal `.acks.json` if a save triggers it — scrub anything
  sensitive).
- The browser + version and the tool's version.

## What to expect

This is a single-maintainer hobby project, so there's no guaranteed response-time SLA —
but security reports are taken seriously and prioritized. You'll get an acknowledgement
when the report is seen, and credit in the fix's changelog/advisory if you'd like it.

Because the tool is offline and client-side, the practical mitigation for any unfixed
issue is simple: **only load `.acks.json` files you trust** (your own, or ones from a
source you trust), just as you would with any document.
