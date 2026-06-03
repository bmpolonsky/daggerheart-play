/** @jsxImportSource preact */
import type { JSX } from "preact";
import { TextControl } from "../../../../ui/components/common/Field";

type InputProps = JSX.IntrinsicElements["input"];

export function Input({ className, type = "text", ...props }: InputProps) {
  return <TextControl type={type} className={className} {...(props as any)} />;
}
