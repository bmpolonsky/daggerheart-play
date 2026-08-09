# Project Guidance For Agents

## UI Work

The application UI style is a custom dark-glass design system. Do not create ad-hoc screen-level buttons, cards, tabs, inputs, panels, or modal chrome when a shared primitive fits.

Before changing UI, read:

- `src/ui/components/common/README.md`
- `src/styles/cinematic/design-system.css`

Use shared primitives from `src/ui/components/common`:

- `Button` for text commands.
- `IconButton` for icon-only commands.
- `Surface` for glass layout panels.
- `Card` only for repeated item cards.
- `ChoiceCard` for clickable selections.
- `Field` controls for inputs/selects/textareas.
- `Tabs` and `TabButton` for tab rows.
- `Toolbar`, `SectionHeader`, `ModalShell`, `Checkbox`, `ResourcePips` where applicable.

Avoid:

- new generic `.button`, `.card`, `.input`, `.panel`, `.tabs` classes;
- square command buttons;
- borders around every nested container;
- custom control gradients;
- raw `button`, `input`, `select`, or `textarea` when a common primitive fits.

If a primitive is missing, add it under `src/ui/components/common` with a `.module.css`, exported prop types, an `index.ts` export, and README documentation. Then replace at least one real caller.

Keep card creator print/card preview styles isolated; the design system applies to editor chrome, tools, lobby, VTT, and application panels.

## UI Architecture

Keep business rules out of Preact components and hooks. Components may hold ephemeral presentation state, render view models, and dispatch user intents. Put state transitions and cross-domain decisions in services, and put reusable projections, filtering, sorting, and grouping in pure model/helper modules that can be unit tested without rendering UI.
