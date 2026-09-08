import { useState, type Dispatch, type SetStateAction } from 'react'

/**
 * Holds an editable copy of a record that arrives asynchronously.
 *
 * Seeds the draft during render rather than in an effect: an effect would
 * render once with `null`, then again with the data. Adjusting state during
 * render lets React discard the first pass before it reaches the DOM.
 *
 * Re-seeds whenever `identity` changes, so navigating between records replaces
 * the draft instead of showing the previous one's values.
 */
export function useEditableDraft<T>(
  source: T | undefined,
  identity: string | undefined,
): [T | null, (patch: Partial<T>) => void, Dispatch<SetStateAction<T | null>>] {
  const [draft, setDraft] = useState<T | null>(null)
  const [seededIdentity, setSeededIdentity] = useState<string | null>(null)

  if (source && identity && identity !== seededIdentity) {
    setSeededIdentity(identity)
    setDraft(source)
  }

  function update(patch: Partial<T>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return [draft, update, setDraft]
}
