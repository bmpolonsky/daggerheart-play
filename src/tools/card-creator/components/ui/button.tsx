/** @jsxImportSource preact */
import type { JSX } from "preact";
import { Button as CommonButton } from "../../../../ui/components/common/Button";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "destructive"
  | "link";

type ButtonSize = "md" | "sm" | "lg" | "icon";

type ButtonNativeProps = JSX.IntrinsicElements["button"];

export interface ButtonProps extends ButtonNativeProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  grow?: boolean;
  noWrap?: boolean;
}

const sizeClassMap: Record<ButtonSize, string> = {
  md: "md",
  sm: "sm",
  lg: "lg",
  icon: "icon",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  fullWidth,
  grow,
  noWrap,
  type = "button",
  ...props
}: ButtonProps) {
  const commonVariant = variant === "destructive"
    ? "danger"
    : variant === "primary"
      ? "primary"
      : variant === "ghost" || variant === "link"
        ? "ghost"
        : "secondary";
  return <CommonButton variant={commonVariant} size={sizeClassMap[size] as never} className={className} fullWidth={fullWidth} grow={grow} noWrap={noWrap} type={type} {...(props as any)} />;
}
