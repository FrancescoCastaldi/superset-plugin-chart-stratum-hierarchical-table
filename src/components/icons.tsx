import type { ReactElement, SVGProps } from 'react';

/** Icone in linea al posto delle emoji: stesso aspetto su ogni sistema e colore del testo. */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Icon({ size = 14, children, ...rest }: IconProps & { children: ReactElement | ReactElement[] }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ verticalAlign: '-2px' }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const WandIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 13 11 5" />
    <path d="M10 2v2M13 5h-2M12 3l-1 1" />
  </Icon>
);

export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 2v8M5 7l3 3 3-3M3 13h10" />
  </Icon>
);

export const SaveIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 3h8l2 2v8H3zM5 3v3h5V3M5 13V9h6v4" />
  </Icon>
);

export const WarningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8 2 14 13H2zM8 6v3.5M8 11.2v.1" />
  </Icon>
);

export const BoltIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 2 4 9h4l-1 5 5-7H8z" />
  </Icon>
);
