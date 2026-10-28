import type { Character } from '../../../domain/rules/types';
import type { CharacterBuilderIssue } from '../../../domain/characterBuilder/validation';
import type { BuilderStep } from '../../../domain/characterBuilder/flow';
import { Button, InlineStat, SectionHeader } from '../../components/common';
import { ChevronRight } from 'lucide-react';
import { builderIssueLabel, builderIssueStep } from './summaryPresentation';
import styles from './BuilderSummary.module.css';

export interface BuilderSummaryProps {
  name: string;
  classLabel: string;
  subclassLabel?: string;
  ancestry?: string;
  community?: string;
  traits: Array<{label: string; value: string}>;
  unassignedTraits: string[];
  cards: string[];
  draft: Partial<Character>;
  evasion: number;
  wealth: string;
  blockingIssues: CharacterBuilderIssue[];
  warnings: string[];
  onGoToStep: (step: BuilderStep) => void;
}

export function BuilderSummary(props: BuilderSummaryProps) {
  const {draft} = props;
  return <div className={styles.root}>
    {props.blockingIssues.length > 0 && <section className={styles.needs} aria-label="Нужно завершить">
      <SectionHeader title="Нужно завершить" />
      {props.blockingIssues.map(issue => <Button key={issue.id} variant="ghost" size="sm" iconAfter={<ChevronRight size={14} aria-hidden="true" />} onClick={() => props.onGoToStep(builderIssueStep(issue.id))}>{builderIssueLabel(issue, props.unassignedTraits)}</Button>)}
    </section>}
    <div className={`cinematic-builder-loadout-summary ${styles.groups}`}>
      <section aria-label="Персонаж" className={styles.group}>
        <SectionHeader title="Персонаж" />
        <strong>{props.name}</strong>
        <dl><dt>Класс</dt><dd>{props.classLabel}</dd><dt>Подкласс</dt><dd>{props.subclassLabel || 'Не выбран'}</dd>
          <dt>Родословная</dt><dd>{props.ancestry || 'Не выбрана'}</dd><dt>Сообщество</dt><dd>{props.community || 'Не выбрано'}</dd></dl>
      </section>
      <section aria-label="Характеристики" className={styles.group}>
        <SectionHeader title="Характеристики" />
        <div className={styles.traits}>{props.traits.map(trait => <InlineStat key={trait.label} label={trait.label} value={trait.value} />)}</div>
      </section>
      <section aria-label="Снаряжение" className={styles.group}>
        <SectionHeader title="Снаряжение" />
        <dl><dt>Оружие</dt><dd>{draft.weapons?.map(weapon => weapon.name).join(', ') || 'Не выбрано'}</dd>
          <dt>Броня</dt><dd>{draft.armor?.name || 'Не выбрана'}</dd><dt>Уклонение</dt><dd>{props.evasion}</dd>
          <dt>Деньги</dt><dd>{props.wealth}</dd><dt>Инвентарь</dt><dd>{draft.inventory?.map(item => item.name).join(', ') || 'Нет предметов'}</dd></dl>
      </section>
      <section aria-label="Карты и опыты" className={styles.group}>
        <SectionHeader title="Карты и опыты" />
        <dl><dt>Карты</dt><dd>{props.cards.length ? <ul>{props.cards.map((name,index) => <li key={index}>{name}</li>)}</ul> : 'Не выбраны'}</dd>
          <dt>Опыты</dt><dd>{draft.experiences?.length ? <ul>{draft.experiences.map(experience => <li key={experience.id}>{experience.name} {experience.modifier >= 0 ? '+' : ''}{experience.modifier}</li>)}</ul> : 'Не заполнены'}</dd></dl>
      </section>
    </div>
    {props.warnings.length > 0 && <details className={styles.warnings}><summary>Что проверить вручную</summary><ul>{props.warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul></details>}
  </div>;
}
