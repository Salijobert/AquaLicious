import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type ModalHeaderVariant = 'default' | 'subtle' | 'hero' | 'danger';

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl'
};

export interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  size?: ModalSize;
  maxWidth?: string;
  headerVariant?: ModalHeaderVariant;
  headerDescription?: React.ReactNode;
  hideCloseButton?: boolean;
  disableClose?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
  zIndexClass?: string;
  bodyClassName?: string;
  footer?: React.ReactNode;
  footerClassName?: string;
  ariaLabelledBy?: string;
  cardRef?: React.Ref<HTMLDivElement>;
  backdropRef?: React.Ref<HTMLDivElement>;
  closeAriaLabel?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  maxWidth,
  headerVariant = 'default',
  headerDescription,
  hideCloseButton = false,
  disableClose = false,
  closeOnBackdrop = true,
  closeOnEsc = true,
  zIndexClass = 'z-50',
  bodyClassName = '',
  footer,
  footerClassName = '',
  ariaLabelledBy,
  cardRef,
  backdropRef,
  closeAriaLabel = 'Close modal',
  children
}) => {
  const generatedTitleId = useId();
  const titleId = ariaLabelledBy || generatedTitleId;

  useEffect(() => {
    if (!isOpen || !closeOnEsc || disableClose || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEsc, disableClose, onClose]);

  if (!isOpen) return null;

  const isHero = headerVariant === 'hero';
  const isSubtle = headerVariant === 'subtle';
  const isDanger = headerVariant === 'danger';

  const headerBgClass = isHero
    ? 'bg-gradient-to-r from-[#0b3d91] via-[#1565c0] to-[#1e88e5] text-white border-b border-blue-800/20'
    : isDanger
    ? 'bg-red-50 border-b border-red-200 text-red-900'
    : isSubtle
    ? 'bg-slate-50 border-b border-slate-200 text-slate-900'
    : 'bg-white border-b border-slate-200 text-slate-900';

  const titleColorClass = isHero
    ? 'text-white'
    : isDanger
    ? 'text-red-900'
    : 'text-[#0b3d91]';

  const closeBtnClass = isHero
    ? 'aq-modal-close bg-white/20 hover:bg-white/30 text-white'
    : 'aq-modal-close bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900';

  return (
    <div
      ref={backdropRef}
      tabIndex={-1}
      className={`fixed inset-0 ${zIndexClass} aq-modal-backdrop`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      onClick={() => {
        if (closeOnBackdrop && !disableClose && onClose) {
          onClose();
        }
      }}
    >
      <div
        ref={cardRef}
        className={`aq-modal-card ${SIZE_CLASSES[size]} bg-white text-slate-900`}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideCloseButton || headerDescription) && (
          <div className={`aq-modal-header ${headerBgClass}`}>
            <div className="aq-modal-header-main flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
                <div className="min-w-0 flex-1">
                  {subtitle && (
                    <div
                      className={`text-[11px] uppercase tracking-wider font-bold mb-0.5 ${
                        isHero ? 'text-blue-100' : 'text-slate-500'
                      }`}
                    >
                      {subtitle}
                    </div>
                  )}
                  {title && (
                    <h2
                      id={titleId}
                      className={`aq-modal-title font-serif font-bold text-lg sm:text-xl leading-snug break-words ${titleColorClass}`}
                    >
                      {title}
                    </h2>
                  )}
                </div>
              </div>

              {!hideCloseButton && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={disableClose}
                  className={closeBtnClass}
                  aria-label={closeAriaLabel}
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {headerDescription && (
              <div
                className={`mt-2.5 text-xs sm:text-sm leading-relaxed ${
                  isHero ? 'text-white/90' : 'text-slate-600'
                }`}
              >
                {headerDescription}
              </div>
            )}
          </div>
        )}

        <div className={`aq-modal-body ${bodyClassName}`}>{children}</div>

        {footer && (
          <div className={`aq-modal-footer ${footerClassName}`}>{footer}</div>
        )}
      </div>
    </div>
  );
};
