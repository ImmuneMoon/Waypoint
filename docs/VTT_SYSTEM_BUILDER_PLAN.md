# Handbook, rules engine and VTT system builder — assessment

Written 2026-09-08 after a conversation with a user. Not started; kept here so the thinking is not lost.

## The prompt

> how difficult would it be to implement a handbook section in the left panel that lets you write out a system's rules for a campaign? and, taking that further, how difficult would it be to be able to leverage that into a vtt system where you can customize the way the attributes do math, or implement skills, how dice rolls work, or make a simple DND like homebrew game system. with the ability to make custom character sheets that display in the play board for players (pick how fields are layed out, etc) and apply rules made in the system, even granular ones like gurps into the vtt where the whiteboard can become a place a player can craft their own character using the systems rules and item libraries the GM crafts? a complete system creator, character sheet builder, and dice rolling system that follows the crafted rules. in a way thats intuitive and either requires no coding, or very little custom syntax.

## Short answer

The handbook is easy and mostly exists in pieces. The rest is a real product on its own, but it splits into stages where each one is useful by itself, and Waypoint's shape already fits most of it.

## Stage 1 — Handbook section in the left panel

- Difficulty: low. About a day.
- Planners already give rich-text blocks, tables, images, find, status and exports. A Handbook section is a third tree next to Planners and Maps holding the same kind of documents, with a few extras: a "Rules" document type, a table of contents built from headings, and a read-only copy sent to players so it opens in their Journal or a Handbook tab.
- Nothing new has to be invented. It is the same block editor with a different door.

## Stage 2 — A rules model with no code

This is where the difficulty starts, and it is about the data model, not the UI.

- A system is a set of definitions: attributes, derived values, skills, resources, conditions, item types and dice expressions. The trick is a formula language small enough to feel like a spreadsheet: `STR + DEX`, `floor((STR - 10) / 2)`, `d20 + Skill.Stealth + mods`. Anyone who has used a spreadsheet can write that. That is the "very little custom syntax", and it is a safe, sandboxed evaluator, not code.
- A system editor then becomes forms: a list of attributes with min, max and default; derived fields each with a formula; skills that point at an attribute; item templates with fields. GURPS-level granularity is the same forms with more rows and a few more operators (lookup tables, conditional bonuses).
- Difficulty: medium. Roughly two to three weeks to a solid first version, most of it in the formula engine and its error messages.

## Stage 3 — Character sheet builder

- A sheet is a layout of fields bound to the system: a grid where the GM drops attribute boxes, skill lists, resource bars, text areas and item lists, and sets their order and size. Players fill it in on the play board; every field either stores a value or shows a formula result.
- This is roughly the planner block editor again, with a grid layout and field types instead of paragraphs. Character data lives on the token, which already carries a name, stats text and owner, so sheets attach to what exists.
- Difficulty: medium to high. Layout editing that feels good is fiddly. Two to four weeks.

## Stage 4 — Dice and rolls that follow the rules

- A roll is a formula with dice in it. The stage 2 engine evaluates `d20 + Skill.Stealth`, shows the breakdown, and posts it to chat and the session log. Buttons on the sheet fire rolls. Advantage, exploding dice, success counting and GURPS-style 3d6-under-target are a handful of operators.
- Difficulty: low once stage 2 exists. A few days. Dice were already deferred to "the VTT work"; this is that.

## Stage 5 — Item libraries and player-built characters

- The GM crafts item templates and a library; players build characters from the sheet using the library; the rules validate them: point budgets, prerequisites, caps. Validation is more formulas: a cost formula per item and a budget on the system.
- Difficulty: medium. The library UI is like the Image Library and the Campaign Cast, which exist.

## What makes it hard

- The formula engine has to be right, well tested, and give plain error messages. Everything else stands on it.
- Layout tools drift toward "why can't it do X" forever. Keeping the sheet builder to a grid of about a dozen field types is what keeps it shippable.
- Sync: sheets and rolls travel over the existing wire, sanitized like everything else. Known ground in Waypoint, not new risk.

## Totals and order

- Stage 1 alone: one release.
- Stages 2 through 5 in order: two to three months of steady work, each stage shipping on its own. Stage 2 plus stage 4 already give a working homebrew engine before any sheet builder exists.
- Sensible first move if it ever goes ahead: stage 1 plus the formula engine as a hidden foundation, then the system editor on top. Do not start with the sheet builder.

## Status

Idea only. Talked over with a user; no work started as of 2026-09-08.
