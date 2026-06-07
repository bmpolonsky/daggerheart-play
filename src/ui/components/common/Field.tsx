import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import styles from './Field.module.css';

type UiNode = any;
export type ControlTone = 'default' | 'plain';

export interface FieldProps {
  label: string;
  hint?: UiNode;
  children: UiNode;
  className?: string;
}

export function Field({ label, hint, children, className = '' }: FieldProps) {
  return (
    <label className={`dh-label ${styles.label} ${className}`.trim()}>
      <span className={styles.caption}>{label}</span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

function controlClass(className = '', extra = '', tone: ControlTone = 'default'): string {
  return `dh-field ${styles.control} ${tone === 'plain' ? styles.plain : ''} ${extra} ${className}`.trim();
}

export interface ControlToneProps {
  tone?: ControlTone;
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement>, ControlToneProps {
  label: string;
  hint?: UiNode;
}

export function TextField({ label, hint, className = '', tone = 'default', ...props }: TextFieldProps) {
  return (
    <Field className={className} label={label} hint={hint}>
      <input className={controlClass('', '', tone)} {...props} />
    </Field>
  );
}

export interface NumberFieldProps extends InputHTMLAttributes<HTMLInputElement>, ControlToneProps {
  label: string;
  hint?: UiNode;
}

export function NumberField({ label, hint, className = '', tone = 'default', ...props }: NumberFieldProps) {
  return (
    <Field className={className} label={label} hint={hint}>
      <input className={controlClass('', '', tone)} type="number" {...props} />
    </Field>
  );
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: UiNode;
}

export function TextAreaField({ label, hint, className = '', ...props }: TextAreaFieldProps) {
  return (
    <Field className={className} label={label} hint={hint}>
      <textarea className={`dh-textarea ${styles.control} ${styles.textarea}`} {...props} />
    </Field>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  hint?: UiNode;
  children: UiNode;
}

export function SelectField({ label, hint, children, className = '', ...props }: SelectFieldProps) {
  return (
    <Field className={className} label={label} hint={hint}>
      <select className={`dh-select ${styles.control}`} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function TextControl({ className = '', tone = 'default', ...props }: InputHTMLAttributes<HTMLInputElement> & ControlToneProps) {
  return <input className={controlClass(className, '', tone)} {...props} />;
}

export function NumberControl({ className = '', tone = 'default', ...props }: InputHTMLAttributes<HTMLInputElement> & ControlToneProps) {
  return <input className={controlClass(className, '', tone)} type="number" {...props} />;
}

export function TextAreaControl({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`dh-textarea ${styles.control} ${styles.textarea} ${className}`.trim()} {...props} />;
}

export function SelectControl({ children, className = '', ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { children: UiNode }) {
  return (
    <select className={`dh-select ${styles.control} ${className}`.trim()} {...props}>
      {children}
    </select>
  );
}
