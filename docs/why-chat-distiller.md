# Why Chat Distiller: The Gap Between Design and Implementation

[简体中文](why-chat-distiller.zh-CN.md)

Day-to-day software work with AI can often be divided into two broad stages:
**design** and **implementation**.

Design here has a broad meaning. It includes architecture, algorithms,
requirements, trade-offs, constraints, and the exploration of possible
solutions—not only visual design.

Implementation is well suited to Coding Agents. They can inspect repositories,
edit files, run tests, verify results, and continue working through concrete
tasks. During design, however, spending a long time discussing ideas directly
with a Coding Agent is not always the best fit.

Design involves exploration: clarifying requirements, comparing approaches,
examining boundaries, challenging assumptions, and repeatedly revising
direction. Browser-based AI Chat products often provide a better environment
for this work. Their typography and reading experience make long text, tables,
diagrams, and multi-turn reasoning easier to follow. Some products allow users
to select a passage and request a targeted revision without rewriting the whole
conversation. Some support branching conversations for exploring multiple
directions, while cross-device continuity and richer history make ongoing
discussions easier to revisit.

Some Chat products also provide built-in memory across conversations, allowing
long-term background, personal preferences, and project context to carry
forward. Keeping brainstorming and design discussions there also preserves
Coding Agent context and usage limits for the work that benefits most from
them: editing code, invoking tools, and completing implementation tasks.

The problem appears when design is complete.

Once a discussion produces useful conclusions, bringing them back into the
local development environment is often awkward. We copy fragments from several
chats, manually assemble a document, save it somewhere, and then ask a Coding
Agent to read it. Full-chat exporters preserve the process, but the transcript
also contains experiments, repetition, misunderstandings, rejected approaches,
and temporary context. Copying everything leaves too much noise; copying only
the final conclusion can lose important constraints and decision rationale.

This creates a natural gap between browser-based AI Chat and local Coding
Agents.

**Chat Distiller is designed to bridge that gap.** It asks the AI in the current
conversation to extract the durable knowledge worth keeping and organizes
decisions, constraints, insights, and follow-up actions scattered across the
discussion into structured Markdown, then saves it directly to an authorized
local directory.

Design can remain in the Chat interface best suited to thinking and discussion.
Implementation can remain with the Coding Agent best suited to operating on the
project. Chat Distiller connects the two, allowing knowledge accumulated during
design to enter the local workflow in a cleaner, more stable, and reusable form.
