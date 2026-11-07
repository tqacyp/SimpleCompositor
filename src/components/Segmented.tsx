interface SegmentedOption<T> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedProps<T> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 无障碍名称，说明这组按钮控制什么。 */
  label: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={option.value === value ? 'is-active' : ''}
          aria-pressed={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
