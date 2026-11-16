import React from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'primary'
  | 'secondary';

export interface StatusBadgeProps {
  children?: React.ReactNode;
  label?: string;
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  className?: string;
  title?: string;
  maxLength?: number;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: 'bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9]',
  warning: 'bg-[#fff3e0] text-[#e65100] border border-[#ffe0b2]',
  danger: 'bg-[#ffebee] text-[#c62828] border border-[#ffcdd2]',
  info: 'bg-[#e3f2fd] text-[#1565c0] border border-[#bbdefb]',
  primary: 'bg-[#0b3d91] text-white border border-[#0b3d91]',
  neutral: 'bg-[#f5f7fa] text-[#455a64] border border-[#cfd8dc]',
  secondary: 'bg-[#ede7f6] text-[#512da8] border border-[#d1c4e9]'
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  label,
  variant = 'info',
  icon,
  className = '',
  title,
  maxLength = 40
}) => {
  const content = label ?? children;
  const textString = typeof content === 'string' ? content : '';
  const isTooLong = maxLength > 0 && textString.length > maxLength;
  const displayContent = isTooLong ? `${textString.slice(0, maxLength)}…` : content;
  const tooltip = title || (isTooLong ? textString : undefined);

  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold leading-normal whitespace-nowrap min-w-max max-w-full select-none transition-colors ${VARIANT_CLASSES[variant]} ${className}`}
      title={tooltip}
    >
      {icon && <span className="shrink-0 flex items-center justify-center">{icon}</span>}
      <span className="truncate">{displayContent}</span>
    </span>
  );
};

export default StatusBadge;
