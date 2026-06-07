# Daggerheart UI Kit

This directory is the application UI kit. New interface work should start here, not with local `.button`, `.card`, `.input`, one-off borders, or screen-specific glass recipes.

The visual target is dark rounded glass with warm paper text and restrained gold accents. The UI should feel like an in-game tool surface: compact, readable, soft, and consistent. Borders are rare. Nested framed containers are a smell.

## Import Path

Prefer the barrel export:

```tsx
import { Button, IconButton, Surface, TextField } from '../components/common';
```

Relative depth varies by feature folder, but the source module should be `components/common`, not individual component files, unless there is a clear bundle reason.

## Foundation

Design tokens live in `src/styles/cinematic/design-system.css` and are scoped to app shells:

- `.cinematic-vtt`
- `.role-entry`
- `.player-view`
- `.tool-viewport`

Core tokens:

- Surfaces: `--dh-glass`, `--dh-glass-strong`, `--dh-glass-subtle`
- Controls: `--dh-control`, `--dh-control-hover`, `--dh-control-active`
- Text: `--dh-paper-100`, `--dh-paper-muted`, `--dh-paper-faint`
- Accent: `--dh-gold-500`, `--dh-gold-400`, `--dh-gold-soft`
- Danger: `--dh-danger-500`, `--dh-danger-soft`
- Radius: `--dh-radius-sm` `8px`, `--dh-radius` `10px`, `--dh-radius-lg` `12px`
- Focus: `--dh-focus`
- Elevation: `--dh-shadow`, `--dh-shadow-soft`

Do not introduce new global color systems for screens. If a tool needs local aliases, map them to `--dh-*` tokens:

```css
.tool-viewport--combat {
  --combat-panel: var(--dh-glass);
  --combat-paper: var(--dh-paper-100);
}
```

## Component Rules

- Use `Button` for text commands.
- Use `Avatar` for round image/fallback identity accessories.
- Use `IconButton` for icon-only commands. Every icon-only button needs `aria-label` or `title`.
- Use `Surface` for layout panels and glass containers.
- Use `Card` only for repeated item cards with content, not for page sections.
- Use `ChoiceCard` for clickable/selectable choices.
- Use `Field`, `TextField`, `SelectField`, `TextControl`, `SelectControl`, and related controls for all inputs.
- Use `Tabs` and `TabButton` for tab rows. Do not build tabs from arbitrary buttons.
- Use `SegmentedControl` for one-of-many value selection. Do not use tabs for this.
- Use `Toolbar` for compact command groups.
- Use `SectionHeader` for title/subtitle/action headers.
- Use `Checkbox` for boolean options. Do not fake checkboxes with buttons.
- Use `Badge` for small counters, tags, and status pills.
- Use `SearchField` for search inputs with an icon.
- Use `EmptyState` for empty/loading/no-results placeholders.
- Use `Notice` for inline info, warning, success, and error messages.
- Use `ListItem` for compact repeated rows with a title, optional subtitle, value, or action.
- Use `ResourcePips` for hope, hp, stress, armor, and similar pip tracks.
- Use `ModalShell` for modal chrome.

## What Not To Do

Avoid:

- new generic `.button`, `.card`, `.input`, `.panel`, `.modal` classes;
- square command buttons;
- borders on every nested block;
- card inside card inside card layouts;
- screen-specific gradients for controls;
- local focus rings;
- raw `button` for commands when `Button` or `IconButton` fits;
- raw `input`, `select`, or `textarea` when Field controls fit;
- visible instructional copy describing how the UI works unless it is an empty/error state.

Allowed exceptions:

- print/card preview CSS inside card creator;
- domain/game artifact visuals that intentionally represent a physical or rule object;
- canvas/WebGL/gameplay surfaces where the component primitives do not apply.

## Primitive API

### Badge

Use for small counters, tags, and compact status pills.

```tsx
<Badge tone="gold">12</Badge>
```

Props:

- `tone`: `neutral | gold | success | danger | blue`
- `size`: `sm | md`

Guidance:

- Good: item counts, compact status labels, source/type tags.
- Bad: primary actions, large selectable chips, whole row backgrounds.
- Do not hand-roll local `.count` or `.pill` CSS for simple badges.

### Avatar

Use for rounded actor, character, or item identity images.

```tsx
<Avatar src={imageUrl} fallback="К" />
```

Props:

- `src`, `fallback`, `alt`
- `size`: `sm | md | lg`

Guidance:

- Put `Avatar` into `ListItem.leftAccessory` or other accessory slots.
- Keep image URL escaping in the caller when feature-specific helpers are required.

### Button

Use for commands with visible text.

```tsx
<Button variant="primary" size="sm" iconBefore={<Plus size={14} />}>
  Создать
</Button>
```

Props:

- `variant`: `primary | secondary | ghost | danger`
- `size`: `xs | sm | md | lg | icon | iconSm`
- `minWidth`: `sm | md | lg`
- `fullWidth`, `grow`, `noWrap`
- `iconBefore`, `iconAfter`

Guidance:

- `primary`: one main action in a local area.
- `secondary`: normal command.
- `ghost`: quiet command in dense chrome.
- `danger`: destructive action.
- Use `noWrap` or `minWidth` before making bespoke button CSS.

### IconButton

Use for icon-only commands.

```tsx
<IconButton aria-label="Удалить" title="Удалить" variant="ghost" size="sm">
  <Trash2 size={15} aria-hidden="true" />
</IconButton>
```

Props:

- `variant`: `primary | secondary | ghost | danger`
- `size`: `xs | sm | md | lg | xl`
- `tone`: `neutral | gold | blue | green | danger`

Guidance:

- Use `tone` for statusful controls like microphone, online, active, danger.
- Do not add per-screen disabled styling unless the global component state is insufficient.
- Prefer lucide icons.

### Surface

Use for layout panels and glass shells.

```tsx
<Surface tone="glass" padding="md">
  ...
</Surface>
```

Props:

- `as`: element type, default `section`
- `tone`: `glass | solid | subtle`
- `padding`: `none | sm | md`

Guidance:

- `glass`: primary panel over imagery.
- `solid`: denser tool surface.
- `subtle`: nested grouping without visual noise.
- If a `Surface` is nested inside another `Surface`, usually use `tone="subtle"` and avoid adding borders.

### Card

Use for repeated content items, not page layout.

```tsx
<Card title="Сцена боя" actions={<Button size="sm">Открыть</Button>}>
  ...
</Card>
```

Guidance:

- Good: saved games, library items, character rows, adversary cards.
- Bad: whole page sections, modal columns, generic wrappers.

### ChoiceCard

Use for selectable choices.

```tsx
<ChoiceCard selected={selected} layout="media" onClick={select}>
  ...
</ChoiceCard>
```

Props:

- `selected`
- `layout`: `default | class | media | domain`

Guidance:

- Selected state may use accent treatment.
- Unselected choices should stay quiet, usually without a visible border.

### Field Controls

Use field wrappers when a label belongs with the control:

```tsx
<TextField label="Название" value={name} onInput={...} />
<SelectField label="Класс" value={className} onChange={...}>...</SelectField>
```

Use control-only variants inside existing custom rows:

```tsx
<TextControl aria-label="Поиск" value={query} onInput={...} />
<SelectControl aria-label="Ранг" value={rank} onChange={...}>...</SelectControl>
```

Props:

- `tone`: `default | plain` on text/number controls.

Guidance:

- `plain` is for inputs embedded in custom pill/search rows.
- Do not restyle native controls locally for size, border, or focus unless the common component is missing a real state.

### SearchField

Use for search boxes that need a search icon.

```tsx
<SearchField
  placeholder="Поиск..."
  value={query}
  onInput={(event) => setQuery(event.currentTarget.value)}
/>
```

Props:

- `size`: `sm | md`
- `inputClassName` only for layout integration, not for icon geometry.

Guidance:

- Do not rebuild search rows with an absolutely positioned icon per screen.
- If a search field is inside a toolbar, constrain width on the wrapper, not inside the component.

### EmptyState

Use for empty, loading, and no-results placeholders.

```tsx
<EmptyState
  tone="panel"
  title="Ничего не найдено"
  body="Попробуйте изменить фильтры."
/>
```

Props:

- `tone`: `transparent | subtle | panel`
- `size`: `sm | md | lg`
- `icon`, `title`, `body`, `actions`

Guidance:

- Let the component own typography, spacing, and optional icon frame.
- Screen CSS may set placement such as `margin`, `min-height`, or grid column span.
- Avoid duplicated empty copy in adjacent panes.

### Notice

Use for inline status messages, warnings, and recoverable errors.

```tsx
<Notice tone="warning">API недоступен: используется кеш.</Notice>
```

Props:

- `tone`: `info | warning | error | success`

Guidance:

- Prefer `Notice` over local alert classes and Tailwind alert recipes.
- Keep it inline and compact. For modal-level blocking errors, put it near the blocked control or action.

### ListItem

Use for repeated compact rows inside panels and sheets.

```tsx
<ListItem title="Искатель приключений" value="+2" density="compact" />
<ListItem title="Алебарда" subtitle="Сила / Близко / 1d10+2 физ." tone="featured" onClick={open} />
```

Props:

- `title`, `subtitle`, `detail`
- `leftAccessory`: left accessory slot for avatars, icons, status dots, or several inline accessories.
- `value`: right-aligned compact value.
- `rightAccessory`: right accessory slot for values, icons, buttons, or a small action group.
- `density`: `compact | regular`
- `lines`: `1 | 2` for subtitle line clamp.
- `align`: `center | start`
- `tone`: `default | featured`

Guidance:

- Use for sheet rows, library rows, inventory rows, and other repeated one/two-line items.
- Use slots for row accessories instead of rebuilding local row grids.
- If `rightAccessory` is present, `onClick` applies only to the text area to avoid nesting buttons.
- Do not recreate local row padding, title/subtitle typography, or one-off truncation CSS.

### Tabs

Use for tab navigation between content sections.

```tsx
<Tabs label="Разделы" layout="equal">
  <TabButton active={tab === 'players'} onClick={...}>Игроки</TabButton>
  <TabButton active={tab === 'scene'} onClick={...}>Сцена</TabButton>
</Tabs>
```

Props:

- `Tabs.layout`: `auto | equal`
- `TabButton.active`

Guidance:

- Active tab is a soft pill.
- Inactive tab is text-only or very quiet.
- Avoid wrapping tabs in another framed container.
- Do not use tabs for picking a value like difficulty, attack mode, or roll type. Use `SegmentedControl`.

### SegmentedControl

Use for choosing one value from a small fixed set.

```tsx
<SegmentedControl
  label="Тип броска"
  layout="equal"
  value={rollType}
  onChange={setRollType}
  options={[
    { value: 'action', label: 'Действие' },
    { value: 'reaction', label: 'Реакция' },
  ]}
/>
```

Props:

- `layout`: `auto | equal`
- `size`: `sm | md`
- `tone`: `neutral | gold`

Guidance:

- Good: difficulty mode, roll type, attack/damage mode.
- Bad: navigation between large content sections.
- Prefer `neutral` unless the selected value is itself an accent action.

### Toolbar

Use for compact command clusters.

```tsx
<Toolbar>
  <IconButton aria-label="Импорт"><Upload size={15} /></IconButton>
  <IconButton aria-label="Экспорт"><Download size={15} /></IconButton>
</Toolbar>
```

### SectionHeader

Use for section headings with optional actions.

```tsx
<SectionHeader title="Персонажи" subtitle="Игроки и назначенные герои" actions={<Button size="sm">Создать</Button>} />
```

### ModalShell

Use for modal chrome: backdrop, glass shell, optional title/actions, click-outside close.

```tsx
<ModalShell title={<h2>Библиотека</h2>} actions={<IconButton aria-label="Закрыть">...</IconButton>} onClose={close}>
  ...
</ModalShell>
```

Guidance:

- Put modal content inside; do not create another full framed shell inside it.
- Use `actions` for close buttons or compact modal commands.
- If the modal needs tabs, place `Tabs` in content or header, not a custom row of buttons.

### Checkbox

Use for boolean options.

```tsx
<Checkbox checked={enabled} onChange={...} label="Враги низкого ранга" meta="+1 ОБ" />
```

Props:

- `size`: `sm | md`
- `layout`: `inline | row`
- `boxPosition`: `start | end`

Guidance:

- Use `boxPosition="end"` for settings rows with `meta`.
- Use `boxPosition="start"` for ordinary inline toggles like private roll.
- Use `layout="row"` only when the whole row needs a soft background.

### ResourcePips

Use for pip tracks.

```tsx
<ResourcePips label="Надежда" tone="hope" current={hope} max={6} onChange={setHope} />
```

Props:

- `tone`: `hope | hp | stress | armor`
- `filledMeansMarked`: flips the visual meaning for available-vs-marked tracks.
- `onChange`: optional; without it pips render read-only.

### ImageFilePicker and FilePicker

Use for image/music upload controls.

```tsx
<ImageFilePicker label="Портрет" imageUrl={portraitUrl} onFileSelect={uploadPortrait} onClear={clearPortrait} />
<FilePicker accept="audio/*" icon="music" label="Музыка" valueLabel={trackName} onFileSelect={uploadTrack} />
```

Props:

- `accept`
- `label`
- `valueLabel`
- `previewUrl` / `imageUrl`
- `emptyLabel`
- `aspectRatio`
- `size`: `default | compact`
- `icon`: `image | music`
- `onFileSelect`, `onClear`

Guidance:

- Use this instead of raw file inputs.
- Keep the preview frame as the click target.
- `compact` is for dense tool rows.

### NavButton

Use for sidebar/navigation actions.

```tsx
<NavButton active={tab === 'characters'} onClick={...}>
  Персонажи
</NavButton>
```

Props:

- `active`
- `collapsed`

Guidance:

- Use for vertical app/tool navigation, not for commands.
- Commands still use `Button` or `IconButton`.

### StepRailButton and WizardStepButton

Use for wizard/step navigation.

```tsx
<StepRailButton active={step === 'class'} label="Класс" onClick={...} />
<WizardStepButton active={step === 'class'} index={1} label="Класс" onClick={...} />
```

Guidance:

- `StepRailButton` is compact rail navigation.
- `WizardStepButton` is the numbered builder stepper.
- Do not hand-roll numbered pills for builders.

### InlineStat

Use for compact label/value metrics inside cards and previews.

```tsx
<InlineStat label="Уклонение" value={10} />
<InlineStat label="Броня" value="3/6" hint="слоты" />
```

Guidance:

- Use for short stats only.
- For editable numbers, use `NumberField` or `NumberControl`.

## Component Inventory

| Component | Use For | Do Not Use For |
| --- | --- | --- |
| `Button` | Text commands | Icon-only controls |
| `IconButton` | Icon commands | Text commands |
| `Surface` | Layout glass panels | Repeated list items |
| `Card` | Repeated content items | Page sections or generic wrappers |
| `ChoiceCard` | Selectable choices | Static content |
| `Field` and controls | Inputs/selects/textareas | Decorative text rows |
| `Tabs` / `TabButton` | Tab navigation | Segmented boolean choices |
| `Toolbar` | Compact command groups | Layout panels |
| `SectionHeader` | Heading + actions | Whole panels |
| `ModalShell` | Modal chrome | Nested modal content cards |
| `Checkbox` | Boolean options | Multi-choice tabs |
| `ResourcePips` | Pip resources | Generic progress bars |
| `ImageFilePicker` / `FilePicker` | File uploads | URL text fields |
| `NavButton` | Sidebar/navigation rows | Form submit/actions |
| `StepRailButton` | Compact step rails | Normal tabs |
| `WizardStepButton` | Numbered wizard steps | Choice cards |
| `InlineStat` | Compact read-only stats | Editable stats |

## Adding A New Primitive

Add a primitive only when at least one is true:

- the behavior or visual state will repeat in multiple screens;
- existing primitives require local CSS overrides in more than one place;
- the element has important accessibility semantics;
- it represents a system-level design concept such as glass panel, command, choice, tab, field, modal, pip track.

When adding one:

1. Put `Component.tsx` and `Component.module.css` in this directory.
2. Use `--dh-*` tokens only.
3. Export prop types.
4. Add it to `index.ts`.
5. Add a README section with examples and selection guidance.
6. Replace at least one caller so the component is proven useful.

## Review Checklist

Before merging UI work:

- Imports use common primitives where they fit.
- No new screen-level `.button`, `.card`, `.input`, `.tabs`, `.panel` abstractions.
- No new borders around nested containers unless they mark focus, active selection, input, or pips.
- Buttons have stable min-height and text does not wrap unexpectedly.
- Icon-only controls have accessible names.
- Text fits at mobile widths.
- The page has no horizontal overflow.
- Card creator print/card preview styles remain isolated from editor chrome.
