/** @jsxImportSource preact */
import type { JSX } from "preact";

type IconProps = JSX.SVGAttributes<SVGSVGElement>;

const baseProps: Partial<IconProps> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const IconSearch = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20 16.5 16.5" />
  </svg>
);

export const IconRotateCw = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const IconHelpCircle = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.25 9a3 3 0 0 1 5.67 1.3c0 1.7-2.17 2.3-2.17 2.3" />
    <path d="M12 17h.01" />
  </svg>
);

export const IconClose = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M18 6 6 18" />
    <path d="M6 6 18 18" />
  </svg>
);

export const IconUpload = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="M12 5v12" />
    <path d="m7 10 5-5 5 5" />
    <path d="M5 19h14" />
  </svg>
);

export const IconChevronRight = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const IconGrid3x3 = (props: IconProps) => (
  <svg {...baseProps} {...props}>
    <rect x="3" y="3" width="5" height="5" rx="1" />
    <rect x="10" y="3" width="4" height="5" rx="1" />
    <rect x="16" y="3" width="5" height="5" rx="1" />
    <rect x="3" y="10" width="5" height="4" rx="1" />
    <rect x="10" y="10" width="4" height="4" rx="1" />
    <rect x="16" y="10" width="5" height="4" rx="1" />
    <rect x="3" y="16" width="5" height="5" rx="1" />
    <rect x="10" y="16" width="4" height="5" rx="1" />
    <rect x="16" y="16" width="5" height="5" rx="1" />
  </svg>
);
