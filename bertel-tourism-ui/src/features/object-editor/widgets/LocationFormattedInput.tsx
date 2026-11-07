'use client';

import { useEffect, useState } from 'react';
import { normalizeLocationReferenceText } from '../../../lib/location-normalization';
import { Input } from '../primitives';

interface LocationFormattedInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  mono?: boolean;
  'aria-label'?: string;
}

/** Free-text location field — applies corpus title-case rules on blur. */
export function LocationFormattedInput({
  value,
  onChange,
  placeholder,
  mono,
  'aria-label': ariaLabel,
}: LocationFormattedInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commitDraft() {
    const normalized = normalizeLocationReferenceText(draft);
    setDraft(normalized);
    if (normalized !== value) {
      onChange(normalized);
    }
  }

  return (
    <Input
      value={draft}
      onChange={setDraft}
      onBlur={commitDraft}
      placeholder={placeholder}
      mono={mono}
      aria-label={ariaLabel}
    />
  );
}
