import { Chip, ChipSet } from './index';

interface ChipMultiSelectProps {
  options: { code: string; label: string }[];
  selected: string[];
  onToggle: (code: string) => void;
  sm?: boolean;
}

/** Chip-toggle multiselect over a flat option list. Selected ⇄ codes array. */
export function ChipMultiSelect({ options, selected, onToggle, sm }: ChipMultiSelectProps) {
  return (
    <ChipSet>
      {options.map((option) => (
        <Chip
          key={option.code}
          label={option.label}
          on={selected.includes(option.code)}
          onClick={() => onToggle(option.code)}
          sm={sm}
        />
      ))}
    </ChipSet>
  );
}
