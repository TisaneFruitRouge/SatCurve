import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { formatSats } from "../lib/format";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  maxBalance?: bigint;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function AmountInput({
  value,
  onChange,
  maxBalance,
  error,
  disabled,
  placeholder = "0.00000000",
}: AmountInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(raw) || raw === "") {
      onChange(raw);
    }
  }

  function handleMax() {
    if (maxBalance !== undefined) {
      onChange(formatSats(maxBalance));
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={handleChange}
            disabled={disabled}
            placeholder={placeholder}
            className="font-mono bg-secondary border-border text-text pr-16 focus-visible:ring-brand/30 focus-visible:border-brand"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm pointer-events-none">
            sBTC
          </span>
        </div>
        {maxBalance !== undefined && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleMax}
            disabled={disabled}
            className="shrink-0 border-border text-text-muted hover:text-text hover:bg-secondary"
          >
            MAX
          </Button>
        )}
      </div>
      {error && <p className="text-error text-xs pl-1">{error}</p>}
    </div>
  );
}
