import type { BookRecord } from '../types';

const PALETTES: [string, string][] = [
  ['#b06a3f', '#6b3a1f'],
  ['#4e6e5d', '#2f4639'],
  ['#5a6b8c', '#333f57'],
  ['#8c5a6b', '#57333f'],
  ['#7a6a4f', '#4a3f2d'],
  ['#3f6a6e', '#254245'],
];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function fallbackCoverStyle(title: string): { background: string } {
  const [a, b] = PALETTES[hash(title) % PALETTES.length];
  return { background: `linear-gradient(145deg, ${a}, ${b})` };
}

interface BookCoverProps {
  book: Pick<BookRecord, 'title' | 'cover' | 'format'>;
  className?: string;
  progress?: number;
  compact?: boolean;
}

export function BookCover({ book, className, progress, compact }: BookCoverProps) {
  const style = fallbackCoverStyle(book.title || '书');
  return (
    <div className={`book-cover ${className ?? ''} ${compact ? 'book-cover--compact' : ''}`}>
      {book.cover ? (
        <img src={book.cover} alt="" draggable={false} />
      ) : (
        <div className="book-cover__fallback" style={style}>
          <span>{Array.from(book.title || '书').slice(0, 4).join('')}</span>
        </div>
      )}
      <span className="book-cover__format">{book.format.toUpperCase()}</span>
      {typeof progress === 'number' && progress > 0 ? (
        <span className="book-cover__progress">
          <span style={{ width: `${Math.round(Math.min(1, progress) * 100)}%` }} />
        </span>
      ) : null}
    </div>
  );
}
