import { cn } from '@/lib/utils';

interface KMLogoProps {
    size?: number;
    wordmark?: boolean;
    className?: string;
}

export function KMLogo({ size = 22, wordmark = true, className }: KMLogoProps) {
    return (
        <div className={cn('inline-flex items-center gap-2 text-primary', className)}>
            {/* When the wordmark renders the SVG is decorative; without it the SVG must name the app. */}
            <svg
                width={size}
                height={size}
                viewBox="0 0 64 64"
                className="block"
                role={wordmark ? undefined : 'img'}
                aria-label={wordmark ? undefined : 'Kubermeister'}
                aria-hidden={wordmark || undefined}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                {/* The helm mid-turn with its king spoke drawn heavier and capped — mirrors resources/icon.svg. */}
                <circle cx="32" cy="32" r="20" strokeWidth="4.5" />
                <path
                    d="M26.82 12.68 25.01 5.92M46.14 17.86 51.09 12.91M51.32 37.18 58.08 38.99M37.18 51.32 38.99 58.08M17.86 46.14 12.91 51.09M12.68 26.82 5.92 25.01"
                    strokeWidth="4.5"
                />
                <path
                    d="M37.66 26.34 46.14 17.86M39.73 34.07 51.32 37.18M34.07 39.73 37.18 51.32M26.34 37.66 17.86 46.14M24.27 29.93 12.68 26.82"
                    strokeWidth="3"
                    opacity="0.6"
                />
                <path d="M30.96 28.14 26.82 12.68" strokeWidth="4.5" />
                <circle cx="25.01" cy="5.92" r="4.2" fill="currentColor" stroke="none" />
                <circle cx="32" cy="32" r="4.5" fill="currentColor" stroke="none" />
            </svg>
            {wordmark && (
                <span className="font-semibold tracking-tight text-foreground" style={{ fontSize: size * 0.72 }}>
                    Kubermeister
                </span>
            )}
        </div>
    );
}
