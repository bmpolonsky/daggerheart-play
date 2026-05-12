export type TabletopFloatingPanel = 'party' | 'handouts' | 'play';
export type TabletopLeftRail = 'feed';

export type TabletopOverlay<Sheet = unknown, CardActivation = unknown> =
  | { kind: 'none' }
  | { kind: 'panel'; panel: TabletopFloatingPanel }
  | { kind: 'leftRail'; rail: TabletopLeftRail }
  | { kind: 'drawer' }
  | { kind: 'sheet'; sheet: Sheet }
  | { kind: 'builder' }
  | { kind: 'cardActivation'; card: CardActivation };

export const NO_TABLETOP_OVERLAY: TabletopOverlay<never> = { kind: 'none' };

export function openTabletopPanel<Sheet, CardActivation>(current: TabletopOverlay<Sheet, CardActivation>, panel: TabletopFloatingPanel): TabletopOverlay<Sheet, CardActivation> {
  if (current.kind === 'panel' && current.panel === panel) return { kind: 'none' };
  return { kind: 'panel', panel };
}

export function openTabletopLeftRail<Sheet, CardActivation>(current: TabletopOverlay<Sheet, CardActivation>, rail: TabletopLeftRail): TabletopOverlay<Sheet, CardActivation> {
  if (current.kind === 'leftRail' && current.rail === rail) return { kind: 'none' };
  return { kind: 'leftRail', rail };
}

export function openTabletopDrawer<Sheet, CardActivation>(): TabletopOverlay<Sheet, CardActivation> {
  return { kind: 'drawer' };
}

export function openTabletopSheet<Sheet, CardActivation>(sheet: Sheet): TabletopOverlay<Sheet, CardActivation> {
  return { kind: 'sheet', sheet };
}

export function openTabletopBuilder<Sheet, CardActivation>(): TabletopOverlay<Sheet, CardActivation> {
  return { kind: 'builder' };
}

export function openTabletopCardActivation<Sheet, CardActivation>(card: CardActivation): TabletopOverlay<Sheet, CardActivation> {
  return { kind: 'cardActivation', card };
}

export function closeTabletopOverlay<Sheet, CardActivation>(): TabletopOverlay<Sheet, CardActivation> {
  return { kind: 'none' };
}

export function tabletopPanelFromOverlay<Sheet, CardActivation>(overlay: TabletopOverlay<Sheet, CardActivation>): TabletopFloatingPanel | null {
  return overlay.kind === 'panel' ? overlay.panel : null;
}
