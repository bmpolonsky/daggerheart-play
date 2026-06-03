import type { ButtonHTMLAttributes } from 'react';
import styles from './ChoiceCard.module.css';

type UiNode = any;

interface ChoiceCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  selected?: boolean;
  layout?: 'default' | 'class' | 'media' | 'domain';
  children: UiNode;
}

const layoutClass: Record<NonNullable<ChoiceCardProps['layout']>, string> = {
  default: '',
  class: styles.classChoice,
  media: styles.media,
  domain: styles.domain
};

export function ChoiceCard({ selected = false, layout = 'default', children, className = '', ...props }: ChoiceCardProps) {
  return (
    <button className={`dh-choice-card ${styles.root} ${layoutClass[layout]} ${selected ? `${styles.selected} dh-is-selected` : ''} ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}
