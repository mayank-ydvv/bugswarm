/** BugSwarm mark: a faceted triangle shard (violet → teal), echoing the particle glyphs. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id="bs-shard-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8052ff" />
          <stop offset="1" stopColor="#15846e" />
        </linearGradient>
        <linearGradient id="bs-shard-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb829" />
          <stop offset="1" stopColor="#8052ff" />
        </linearGradient>
      </defs>
      <polygon points="16,2 30,27 16,21" fill="url(#bs-shard-b)" />
      <polygon points="16,2 16,21 2,27" fill="url(#bs-shard-a)" />
      <polygon points="2,27 16,21 30,27" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}
