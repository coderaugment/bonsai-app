"use client";

interface ModalProps {
  children: React.ReactNode;
}

export function Modal({ children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="w-3/4 h-3/4 rounded-2xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-medium)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
