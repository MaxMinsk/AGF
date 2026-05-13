# Agent Skills (Memos)

The files next to this README are **prose memos**, not invokable Claude Code skills.

## What they are

Each file describes a recurring workflow (when to run `engine check`, how to author a scene, how to debug a failing playtest). They are loaded as context when an agent asks "how do I do X" or when a slash command in `.claude/commands/` points at one.

## What they are not

They are not registered with the Claude Code Skill tool. The user cannot type `/engine-check` to invoke them — for that you would need a matching `.claude/commands/<name>.md` file.

If a memo proves useful enough to be invoked routinely, promote it to a slash command in `.claude/commands/` and keep the memo as the underlying procedure document.

## How to add a memo

- File name: `<topic>.md`, kebab-case.
- Sections: `# Skill: <topic>`, `## Trigger`, `## Workflow`, optionally `## Rules` and `## Verification`.
- Keep it small enough that an agent can load it as context without burning much window.
- Reference exact commands (`npm run engine:check -- examples/hello-3d`) so the memo stays operational.

## How to promote a memo to a slash command

1. Add `.claude/commands/<name>.md` with frontmatter (`description`, `argument-hint`).
2. The command body should be short and explicitly reference the underlying memo: "Use the workflow described in `docs/agent/skills/<name>.md` and …".
3. Update `docs/agent/claude-code.md` so the command appears in the project command list.
