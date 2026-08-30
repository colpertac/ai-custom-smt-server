# Phase 11 — Developer and GM quality of life

Started and MVP tested in-game 2026-07-20.

## Goal

Make GM commands discoverable and give visible confirmation instead of forcing
the operator to infer success from game state or server logs.

## MVP changes

### Command help

- `@help COMMAND` prints focused usage and description.
- `@help @COMMAND` is also accepted.
- Unknown commands get an explicit error and a hint to use `@help`.
- More than one help argument prints `Usage: @help [command]`.
- Bare `@help` prints a command count, all usage lines, and a focused-help hint.

The underlying help table already contained per-command descriptions; Phase 11
makes the lookup and responses clearer.

### Common command feedback

| Command | Success feedback |
| --- | --- |
| `@spawn` | Spawn groups refreshed |
| `@item` | Item ID and quantity added |
| `@zone` | Zone, dynamic map, and coordinates entered |
| `@instance` | Instance and variant created |
| `@speed` | Target, multiplier, and effective speed |

These commands also report common failures such as missing zones, invalid item
names, missing summoned demons, and malformed arguments.

## In-game checks

Use an account with sufficient `UserLevel`:

```text
@help spawn
@help @item
@help doesnotexist
@spawn
@item 900001 1
@speed 1.2
@speed 1.2 demon
@zone
```

For `@zone ID` and `@instance ID`, use known-safe IDs from the existing phase
guides.

## Deferred polish

- Categories and pagination for the full bare `@help` list.
- Standardized result objects/helpers shared by every GM command.
- Confirmation messages for lower-use and destructive commands.
- Automated command/parser tests (current validation is build + in-game QA).
