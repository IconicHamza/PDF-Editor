"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  children: React.ReactNode;
}

export function ActionButton({
  isLoading,
  children,
  className = "",
  disabled,
  onClick,
  type = "button",
  ...props
}: ActionButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const clickRef = useRef(onClick);
  const disabledRef = useRef(Boolean(isLoading || disabled));

  useEffect(() => {
    clickRef.current = onClick;
    disabledRef.current = Boolean(isLoading || disabled);
  }, [disabled, isLoading, onClick]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handleNativeClick = (event: MouseEvent) => {
      if (disabledRef.current) return;
      clickRef.current?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
    };

    button.addEventListener("click", handleNativeClick);
    return () => button.removeEventListener("click", handleNativeClick);
  }, []);

  return (
    <button
      ref={buttonRef}
      type={type}
      className={`
        inline-flex min-h-11 items-center justify-center gap-2 rounded-xl
        bg-gradient-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg
        shadow-primary/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/40
        disabled:cursor-not-allowed disabled:opacity-50
        disabled:hover:translate-y-0 disabled:hover:shadow-lg
        ${className}
      `}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
