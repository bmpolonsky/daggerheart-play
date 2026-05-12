/** @jsxImportSource preact */
import type { JSX } from "preact";
import { cn } from "@cards/lib/utils";
import "./input.css";

type InputProps = JSX.IntrinsicElements["input"];

export function Input({ className, type = "text", ...props }: InputProps) {
  return <input type={type} className={cn("input", className)} {...props} />;
}
