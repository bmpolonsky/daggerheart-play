import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface BaseProps {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}

export function Field({ label, hint, children }: BaseProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
}

export function TextField({ label, hint, ...props }: TextFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" {...props} />
    </Field>
  );
}

interface NumberFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
}

export function NumberField({ label, hint, ...props }: NumberFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" type="number" {...props} />
    </Field>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
}

export function TextAreaField({ label, hint, ...props }: TextAreaFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <textarea className="input textarea" {...props} />
    </Field>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}

export function SelectField({ label, hint, children, ...props }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <select className="input" {...props}>
        {children}
      </select>
    </Field>
  );
}
