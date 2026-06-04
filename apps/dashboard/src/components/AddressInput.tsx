import { useEffect, useRef, useState } from 'react';
import { Loader2Icon, MapPinIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api, type AddressSearchResult } from '@/lib/api';
import { cn } from '@/lib/utils';

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export function AddressInput({
  value,
  onChange,
  placeholder = 'Paris, France',
  className,
  inputClassName,
}: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSearchResult[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [loadingQuery, setLoadingQuery] = useState('');
  const [suggestionsQuery, setSuggestionsQuery] = useState('');
  const blurTimer = useRef<number | null>(null);

  const query = value.trim();
  const canSearch = query.length >= 3 && selectedQuery !== query;
  const currentSuggestions = suggestionsQuery === query ? suggestions : [];
  const isCurrentQueryLoading = isLoading && loadingQuery === query;
  const isCurrentQuerySearched = hasSearched && suggestionsQuery === query;
  const showMenu =
    isFocused &&
    canSearch &&
    (isCurrentQueryLoading || isCurrentQuerySearched || currentSuggestions.length > 0);

  useEffect(() => {
    if (!canSearch) return;

    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setLoadingQuery(query);
      setHasSearched(true);
      setSuggestionsQuery(query);
      try {
        const { data } = await api.addresses.search(query, controller.signal);
        if (!cancelled) {
          setSuggestions(data);
          setActiveIndex(data.length > 0 ? 0 : -1);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setActiveIndex(-1);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, query]);

  function selectSuggestion(suggestion: AddressSearchResult) {
    setSelectedQuery(suggestion.label);
    setSuggestions([]);
    setIsFocused(false);
    setHasSearched(false);
    setActiveIndex(-1);
    onChange(suggestion.label);
  }

  function handleChange(nextValue: string) {
    setSelectedQuery(null);
    onChange(nextValue);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!showMenu) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) =>
        currentSuggestions.length === 0 ? -1 : (current + 1) % currentSuggestions.length,
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) =>
        currentSuggestions.length === 0
          ? -1
          : (current - 1 + currentSuggestions.length) % currentSuggestions.length,
      );
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0 && currentSuggestions[activeIndex]) {
      event.preventDefault();
      selectSuggestion(currentSuggestions[activeIndex]);
      return;
    }

    if (event.key === 'Escape') {
      setIsFocused(false);
      setSuggestions([]);
    }
  }

  function handleFocus() {
    if (blurTimer.current !== null) window.clearTimeout(blurTimer.current);
    setIsFocused(true);
  }

  function handleBlur() {
    blurTimer.current = window.setTimeout(() => setIsFocused(false), 120);
  }

  return (
    <div className={cn('relative', className)}>
      <Input
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        aria-expanded={showMenu}
        aria-autocomplete="list"
        className={inputClassName}
      />
      {showMenu && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 overflow-hidden rounded-md border bg-popover shadow-md"
        >
          {isCurrentQueryLoading && currentSuggestions.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              Recherche…
            </div>
          )}
          {!isCurrentQueryLoading && currentSuggestions.length === 0 && isCurrentQuerySearched && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Aucun lieu trouvé, la saisie libre sera conservée.
            </div>
          )}
          {currentSuggestions.map((suggestion, index) => {
            const meta = [suggestion.postcode, suggestion.city].filter(Boolean).join(' ');

            return (
              <button
                key={`${suggestion.label}:${suggestion.lat}:${suggestion.lon}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted',
                  activeIndex === index && 'bg-muted',
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectSuggestion(suggestion);
                }}
              >
                <MapPinIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{suggestion.label}</span>
                  {meta && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {meta}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
