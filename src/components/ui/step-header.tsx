import Image from "next/image";

interface StepHeaderProps {
  title: string;
}

export function StepHeader({ title }: StepHeaderProps) {
  return (
    <div className="flex items-center gap-4 px-10 pt-10 pb-6">
      <Image
        src="/bonsai-os-logo-d.png"
        alt="Bonsai"
        width={56}
        height={56}
        className="rounded-full"
      />
      <h1
        className="text-2xl font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h1>
    </div>
  );
}
