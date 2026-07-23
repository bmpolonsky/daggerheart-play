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
- Use `AssetImage` for repeated public content images that should lazy-load.
- Use `Avatar` for round image/fallback identity accessories.
- Use `IconButton` for icon-only commands. Every icon-only button needs `aria-label` or `title`.
- Use `Surface` for layout panels and glass containers.
- Use `DraggableSurface` for floating movable panels over the game table.
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
- Use `ListDetailLayout` for responsive list/detail workspaces.
- Use `ResourcePips` for hope, hp, stress, armor, and similar pip tracks.
- Use `Dialog` for dialog windows: backdrop, glass surface, title/actions, and click-outside close.
- Use `ConfirmDialog` before destructive actions that remove meaningful user content.

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

### AssetImage

Use for repeated public content images from the cached content library.

```tsx
<AssetImage src={item.imageUrl} alt="" />
```

Props:

- Standard `img` props.
- `loading`: defaults to `lazy`.
- `decoding`: defaults to `async`.

Guidance:

- Good: library thumbnails, adversary cards, handout previews, domain card art.
- Bad: avatar identity images, user-selected file previews, card creator render surfaces, icons.
- Source URLs are normalized through `publicAssetUrl`, including public `/image/...` paths and WebP conversion.

### Badge

Use for small counters, tags, and compact status pills.

```tsx
<Badge tone="gold">12</Badge>
```

Props:

- `tone`: `neutral | gold | success | danger | blue`
- `size`: `xs | sm | md` (`xs` is for quiet source/type labels beside a title)

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

### DraggableSurface

Use for floating movable panels over the VTT, such as call widgets or roll confirmation tools.

```tsx
<DraggableSurface
  aria-label="Видео звонок"
  title="Звонок"
  actions={<IconButton aria-label="Свернуть" title="Свернуть">...</IconButton>}
  defaultPosition={() => ({ x: window.innerWidth - 338, y: window.innerHeight - 316 })}
>
  ...
</DraggableSurface>
```

Guidance:

- Build draggable windows from this primitive instead of local pointer hooks.
- Set `--dh-draggable-z-index` on the feature class when layering matters.
- Put icon-only window controls in `actions`; they are excluded from drag capture.

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
- `mediaFallback`: compact visual placeholder used when a media layout has no image.

Guidance:

- Selected state may use accent treatment.
- Unselected choices should stay quiet, usually without a visible border.
- For `class`, `media`, and `domain` layouts, always provide an image or `mediaFallback`
  so text remains in the content column.

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

### RangeField

Use for a compact bounded numeric adjustment such as zoom, volume, or opacity.

```tsx
<RangeField label="Масштаб" min={1} max={2.5} step={0.05} value={zoom} valueLabel={`${Math.round(zoom * 100)}%`} />
```

Props:

- Standard range input props except `type` and `size`.
- `label`: visible field label.
- `valueLabel`: optional formatted current value.

Guidance:

- Keep a visible value beside the label when the exact setting matters.
- Use a segmented control for a small finite choice such as Fit/Fill.
- Do not use for an unbounded value or when typing an exact number is the primary workflow.

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

### RichChoicePicker

Use when a choice needs more than a short label: rules text, artwork, source, consequence, or a comparison across several entities. It opens a searchable grid and keeps the native select for compact parameters such as a rank or numeric setting.

```tsx
<RichChoicePicker
  label="Новая карта"
  value={cardId}
  placeholder="Выберите карту"
  items={cards}
  onChange={setCardId}
/>
```

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
- If `rightAccessory` is present, `onClick` still covers the row while controls in the accessory keep their own click target.
- Do not recreate local row padding, title/subtitle typography, or one-off truncation CSS.

### ListDetailLayout

Use for workspaces where a list/grid expands full-width until an item opens a detail panel.

```tsx
<ListDetailLayout
  list={<LibraryGrid entries={entries} />}
  detail={selectedEntry ? <LibraryDetail entry={selectedEntry} /> : null}
  listLabel="Записи"
  detailLabel="Детали"
/>
```

Props:

- `list`, `detail`
- `listClassName`, `detailClassName` for the content regions
- `narrowDetailOpen`: keeps both panes on desktop while choosing which pane is visible at `<=1120px`.

Guidance:

- Keep selected/open state in the caller.
- For mobile list → detail journeys, keep `detail` mounted and drive `narrowDetailOpen` from the caller so the list is the initial screen and a back command can restore it.
- Use this for reusable layout behavior, not for styling individual cards.
- Keep the split behavior standardized: full-width list without detail, list/detail split with detail, detail replacing the list on narrow screens.
- Do not duplicate split-grid CSS in screen files when this component fits.

### RichChoicePicker

Use for a selection where a label alone is not enough to make a safe choice: cards, equipment, forms, ancestry, or other rules objects. It opens a responsive list/detail dialog: compact rows on the left and the complete art and rules text on the right. On narrow screens, an option opens its detail with a way back to the list.

```tsx
<RichChoicePicker
  label="Карта домена"
  value={cardId}
  placeholder="Выберите карту"
  items={cards}
  onChange={setCardId}
/>
```

Keep `SelectField` for compact, already-understood parameters such as a numeric mode or short status.

### Tabs

Use for tab navigation between content sections.

```tsx
<Tabs label="Разделы" layout="equal" align="start">
  <TabButton active={tab === 'players'} onClick={...}>Игроки</TabButton>
  <TabButton active={tab === 'scene'} onClick={...}>Сцена</TabButton>
</Tabs>
```

Props:

- `Tabs.layout`: `auto | equal`
- `Tabs.align`: `center | start`; use `start` for rows that can overflow horizontally.
- `TabButton.active`

Guidance:

- Active tab is a soft pill.
- An active tab in an overflowing row is revealed automatically.
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

### ActionMenu

Use for a compact context menu opened by an existing command button when several nearby actions share the same intent.

```tsx
<ActionMenu
  ariaLabel="Добавить"
  items={items}
  renderTrigger={(props) => <IconButton {...props} aria-label="Добавить"><Plus /></IconButton>}
/>
```

Guidance:

- Keep the trigger visible wherever its actions are relevant; do not hide it only behind an empty state.
- Use short commands in the menu. A menu item should take the user to the appropriate focused flow rather than duplicate that flow inside the popover.
- The primitive closes on outside click and Escape, restores trigger focus, and supports arrow-key navigation.

### SectionHeader

Use for section headings with optional actions.

```tsx
<SectionHeader title="Персонажи" subtitle="Игроки и назначенные герои" actions={<Button size="sm">Создать</Button>} />
```

### Dialog

Use for dialog windows: backdrop, glass surface, optional title/actions, click-outside close, Escape close, trapped focus, and focus restoration.

```tsx
<Dialog title={<h2>Библиотека</h2>} actions={<IconButton aria-label="Закрыть">...</IconButton>} onClose={close}>
  ...
</Dialog>
```

Guidance:

- Put modal content inside; do not create another full framed shell inside it.
- Use `actions` for close buttons or compact modal commands.
- If the modal needs tabs, place `Tabs` in content or header, not a custom row of buttons.
- The first enabled control receives focus by default. Add `autoFocus` or `data-dialog-autofocus` when another initial target is more appropriate.

### ConfirmDialog

Use for destructive actions that cannot be undone, such as deleting a scene, character, handout, or saved game.

```tsx
<ConfirmDialog
  title="Удалить сцену?"
  body="Сцена и размещённые на ней токены будут удалены."
  onCancel={() => setConfirmOpen(false)}
  onConfirm={deleteScene}
/>
```

Guidance:

- Render it conditionally from the caller and keep the destructive command inside `onConfirm`.
- Name the affected object in `title` or `body`.
- Keep cancel as the initially focused action.
- Do not use it for reversible toggles or frequent low-risk actions.

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

- `tone`: `hope | hp | stress | armor | fear`
- `filledMeansMarked`: flips the visual meaning for available-vs-marked tracks.
- `onChange`: optional; without it pips render read-only.
- `showHeader`: hides the built-in label/value row when the surrounding composition already owns it.
- `className`: integrates contextual pip sizing without duplicating interaction markup.

### RuleEffectText

Use for prose ranges recognized as typed feature effects. It is deliberately
non-clickable: hover distinguishes a currently applied rule from a rule used
during character creation or card selection and from assisted/manual handling.

```tsx
<RuleEffectText effects={effects}>Получите дополнительную ячейку Ран.</RuleEffectText>
```

Guidance:

- Keep the original rule text visible; the tooltip only explains what the app understood.
- Interactive roll or resource macros may remain nested inside this marker.
- Do not use it as a button or as confirmation that an assisted effect was applied.

### RuleTerm

Use for a small number of ambiguous game terms that have a complete source
article in the compendium.

```tsx
<RuleTerm title={article.name} summary={article.summary} onOpen={openArticle}>
  Проворность
</RuleTerm>
```

Guidance:

- Keep normal text styling; the help cursor and tooltip provide discovery.
- Supply tooltip copy from the source article instead of duplicating rules in UI code.
- Activation must open the complete matching article.
- Omit `onOpen` only when the term is nested inside another primary action, such
  as a roll card; that variant provides hover help without replacing the
  surrounding action.
- Use selectively for stats, resources, and roll concepts; do not wrap every heading or action.
- Do not use it for the automatic/assisted parsing annotation handled by `RuleEffectText`.

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
- `previewStyle`: only image framing properties (`objectFit`, `objectPosition`, `transform`, `transformOrigin`), not screen chrome.
- `size`: `default | compact`
- `hideLabel`: hides the visible caption while preserving the file input's accessible name.
- `icon`: `image | music`
- `onFileSelect`, `onClear`

Guidance:

- Use this instead of raw file inputs.
- Keep the preview frame as the click target.
- Use `previewStyle` when the editor preview must match saved crop/framing settings.
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
| `RangeField` | Bounded numeric adjustments | Exact or unbounded text entry |
| `Tabs` / `TabButton` | Tab navigation | Segmented boolean choices |
| `Toolbar` | Compact command groups | Layout panels |
| `ActionMenu` | Compact contextual command choices | A modal or a multi-step editor |
| `SectionHeader` | Heading + actions | Whole panels |
| `Dialog` | Dialog windows | Nested dialog content cards |
| `Checkbox` | Boolean options | Multi-choice tabs |
| `ListDetailLayout` | List/detail workspaces | Generic page columns |
| `ResourcePips` | Pip resources | Generic progress bars |
| `RuleTerm` | Contextual rule references | Every label or parsed-effect annotations |
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
