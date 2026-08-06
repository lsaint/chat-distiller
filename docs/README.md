# Chat Distiller Documentation

The root [README](../README.md) explains what Chat Distiller does and provides
the shortest installation path. Use these guides for implementation details,
extension boundaries, and recovery procedures.

- [Why Chat Distiller](why-chat-distiller.md) — understand the philosophy of bridging browser AI design discussions and local coding agents.
- [Architecture](architecture.md) — understand component ownership, the task
  lifecycle, and the validated output protocol.
- [Site Adapter Guide](site-adapters.md) — add support for another AI chat site
  without leaking site-specific DOM assumptions into the shared engine.
- [Local Storage and Privacy](local-storage-and-privacy.md) — review local data,
  browser storage, permissions, and trust boundaries.
- [Troubleshooting](troubleshooting.md) — recover from authorization, protocol,
  timeout, and site DOM failures.

For data-handling commitments, also read the [Privacy Policy](../PRIVACY.md).
