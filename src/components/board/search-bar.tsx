"use client";

export function SearchBar() {
  return (
    <div
      className="flex items-center justify-between px-6 py-2.5 border-b"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      {/* Search */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg w-64"
        style={{
          backgroundColor: "var(--bg-input)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <svg
          className="w-4 h-4"
          style={{ color: "var(--text-muted)" }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search tickets..."
          className="bg-transparent text-sm outline-none w-full placeholder:text-[var(--text-muted)]"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {["Filters", "Me", "Show"].map((label) => (
          <button
            key={label}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
            style={{ color: "var(--text-secondary)" }}
          >
            {label === "Filters" && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
            )}
            {label === "Me" && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            )}
            {label === "Show" && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
