import Image from "next/image";

type WingmanLogoProps = {
  className?: string;
  size?: number;
};

/** Wingman mark in a rounded-rect tile (exact brand asset). */
export function WingmanLogo({ className, size = 44 }: WingmanLogoProps) {
  const radius = Math.max(4, Math.round(size * 0.22));

  return (
    <div
      className={`relative shrink-0 overflow-hidden ${className ?? ""}`}
      style={{ width: size, height: size, borderRadius: radius }}
      aria-hidden
    >
      <Image
        src="/wingman-logo.png"
        alt=""
        fill
        className="object-cover"
        sizes={`${size}px`}
        priority
      />
    </div>
  );
}
