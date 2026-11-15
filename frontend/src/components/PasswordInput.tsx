import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputHandle {
  hidePassword: () => void;
  focus: () => void;
}

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  containerClassName?: string;
  autoComplete?: 'current-password' | 'new-password' | 'off';
}

export const PasswordInput = forwardRef<PasswordInputHandle, PasswordInputProps>(({
  label,
  error,
  id,
  className = '',
  containerClassName = '',
  autoComplete = 'current-password',
  disabled,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({
    hidePassword: () => setShowPassword(false),
    focus: () => inputRef.current?.focus()
  }));

  // Re-hide password when page or tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setShowPassword(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <div className={`form-group ${containerClassName}`}>
      {label && (
        <label htmlFor={id} className="form-label text-xs font-semibold text-gray-700 block mb-1">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          {...props}
          ref={inputRef}
          id={id}
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
          disabled={disabled}
          className={`form-control text-xs w-full pr-12 min-h-[42px] ${error ? 'border-red-500' : ''} ${className}`}
        />
        <button
          type="button"
          tabIndex={0}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
          className="absolute right-0 top-0 bottom-0 min-w-[44px] min-h-[44px] px-3 flex items-center justify-center text-gray-500 hover:text-gray-700 active:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-r-lg"
        >
          {showPassword ? (
            <EyeOff className="w-4 h-4 shrink-0 text-slate-600" aria-hidden="true" />
          ) : (
            <Eye className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
          )}
        </button>
      </div>
      {error && (
        <p className="text-red-600 text-[11px] mt-1 font-medium">{error}</p>
      )}
    </div>
  );
});

PasswordInput.displayName = 'PasswordInput';
