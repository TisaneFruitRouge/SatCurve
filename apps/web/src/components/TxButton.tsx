import { Button } from "./ui/button";
import type { ComponentProps } from "react";

interface TxButtonProps extends ComponentProps<typeof Button> {
  pending?: boolean;
  pendingLabel?: string;
}

export function TxButton({
  pending = false,
  pendingLabel = "Confirming…",
  disabled,
  children,
  ...props
}: TxButtonProps) {
  return (
    <Button {...props} disabled={disabled ?? pending}>
      {pending ? (
        <span className="flex items-center gap-2">
          <svg
            className="animate-spin h-3.5 w-3.5 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
