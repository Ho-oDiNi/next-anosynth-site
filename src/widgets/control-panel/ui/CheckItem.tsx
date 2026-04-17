import { Checkbox } from "@/shared/ui/checkbox";

interface CheckItemProps {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function CheckItem({ label, checked, onChange }: CheckItemProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </label>
  );
}
