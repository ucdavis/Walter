import { useCommandPalette } from '@/components/search/CommandPaletteProvider.tsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const isAppleDevice = () => {
  const platform = navigator.platform?.toLowerCase() ?? '';
  return (
    platform.includes('mac') ||
    platform.includes('iphone') ||
    platform.includes('ipad')
  );
};

export function SearchButton({
  className = '',
  placeholder = 'Search…',
  showShortcut = true,
}: {
  className?: string;
  placeholder?: string;
  showShortcut?: boolean;
}) {
  const { open } = useCommandPalette();
  const shortcut = isAppleDevice() ? '⌘' : 'Ctrl';

  return (
    <button
      className={`input input-bordered flex items-center gap-2 text-left ${className}`}
      onClick={open}
      type="button"
    >
      <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-base-content/40" />
      <span className="flex-1 text-base-content/60">{placeholder}</span>
      {showShortcut ? (
        <span className="flex items-center gap-1 text-base-content/40">
          <kbd className="kbd kbd-sm">{shortcut}</kbd>
          <kbd className="kbd kbd-sm">K</kbd>
        </span>
      ) : null}
    </button>
  );
}
