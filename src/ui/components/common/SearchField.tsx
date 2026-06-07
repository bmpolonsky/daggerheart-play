import type { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { TextControl } from './Field';
import styles from './SearchField.module.css';

export type SearchFieldSize = 'sm' | 'md';

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: SearchFieldSize;
  inputClassName?: string;
}

export function SearchField({
  size = 'md',
  className = '',
  inputClassName = '',
  type = 'search',
  ...props
}: SearchFieldProps) {
  return (
    <div className={`dh-search-field ${styles.field} ${styles[size]} ${className}`.trim()}>
      <Search className={styles.icon} size={16} aria-hidden="true" />
      <TextControl
        type={type}
        className={`${styles.control} ${inputClassName}`.trim()}
        {...props}
      />
    </div>
  );
}
