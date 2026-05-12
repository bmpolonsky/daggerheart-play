import type { GameState, EncounterState, SpotlightSide } from './types';

export type EncounterFlowAction = 'start' | 'select' | 'roll' | 'passSpotlight' | 'review';
export type EncounterFlowTone = 'primary' | 'danger' | 'neutral';

export interface EncounterFlowActor {
  kind: 'character' | 'adversary';
  name: string;
}

export interface EncounterFlowInput {
  game: Pick<GameState, 'spotlight' | 'fear'>;
  encounter: Pick<EncounterState, 'status' | 'activeAdversaryId'>;
  selectedActor: EncounterFlowActor | null;
}

export interface EncounterFlowStep {
  action: EncounterFlowAction;
  title: string;
  detail: string;
  tone: EncounterFlowTone;
  disabled?: boolean;
}

export interface EncounterFlowModel {
  statusLabel: string;
  spotlight: SpotlightSide;
  primary: EncounterFlowStep;
  secondary: EncounterFlowStep[];
}

export function buildEncounterFlow(input: EncounterFlowInput): EncounterFlowModel {
  const selected = input.selectedActor;

  if (input.encounter.status === 'prep') {
    return model(input, {
      action: 'start',
      title: 'Начать сцену',
      detail: 'Перевести столкновение в live-режим и держать spotlight в игре.',
      tone: 'primary'
    });
  }

  if (!selected) {
    return model(input, {
      action: 'select',
      title: 'Выбрать актёра',
      detail: 'Кликните героя или противника на сцене, чтобы начать действие.',
      tone: 'primary'
    });
  }

  return model(input, {
    action: 'roll',
    title: 'Сделать бросок',
    detail: `${selected.name}: бросок без автоматического применения к цели.`,
    tone: 'primary'
  });
}

export function actionForStep(step: EncounterFlowStep): EncounterFlowAction {
  return step.action;
}

function model(input: EncounterFlowInput, primary: EncounterFlowStep): EncounterFlowModel {
  return {
    statusLabel: encounterStatusLabel(input.encounter.status),
    spotlight: input.game.spotlight,
    primary,
    secondary: [
      {
        action: 'passSpotlight',
        title: 'Передать ход',
        detail: input.game.spotlight === 'players' ? 'Передать spotlight мастеру.' : 'Вернуть spotlight игрокам.',
        tone: 'neutral'
      },
      {
        action: 'review',
        title: 'Проверить сцену',
        detail: `Fear ${input.game.fear}. Активный противник ${input.encounter.activeAdversaryId ? 'выбран' : 'не выбран'}.`,
        tone: 'neutral'
      }
    ]
  };
}

function encounterStatusLabel(status: EncounterState['status']): string {
  if (status === 'active') return 'идёт';
  if (status === 'paused') return 'пауза';
  if (status === 'completed') return 'завершён';
  return 'подготовка';
}
