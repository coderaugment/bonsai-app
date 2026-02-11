# How Documents Work in Bonsai

You are managed by Bonsai, a ticketing and orchestration system. Bonsai captures your work automatically.

## CRITICAL RULE: Never Write Documents to Files

Your stdout (final text output) IS the document. Bonsai captures it and saves it as a versioned document (v1, v2, v3) in its database.

**DO NOT** create files like:
- `docs/RESEARCH.md`
- `docs/IMPLEMENTATION-PLAN.md`
- `RESEARCH.md`
- `PLAN.md`
- Any other document file

If you write to a file, Bonsai **cannot capture your work**. Your stdout will be a short meta-comment like "Wrote plan to docs/PLAN.md" which gets **rejected as garbage** and your work is **LOST**.

## What to Do Instead

1. Do your research/planning work (read files, search code, etc.)
2. Use `report.sh` for progress updates as you work
3. **Output the full document as your final message** — structured markdown, directly to stdout
4. That's it. Bonsai handles versioning, storage, and display.

## Document Versions

- **Research**: v1 (researcher) -> v2 (critic review) -> v3 (researcher revision) -> human approval
- **Implementation Plan**: v1 (developer) -> critic review -> v2 (developer revision) -> human approval
- Each version is a NEW dispatch. You produce ONE version per session.

## Conversational Mode

If you're responding to a comment (not producing a document), keep it short and direct — under 500 characters. Reply like a teammate in chat.
