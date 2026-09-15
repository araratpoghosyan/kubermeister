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
                viewBox="0 0 24 24"
                className="block"
                role={wordmark ? undefined : 'img'}
                aria-label={wordmark ? undefined : 'Kubermeister'}
                aria-hidden={wordmark || undefined}
            >
                {/* Hexagon with rounded vertices (r ≈ 1.43 units) — mirrors resources/icon.svg. */}
                <path
                    d="M13.27 2.67 L20.23 6.33 Q21.5 7 21.5 8.43 L21.5 15.57 Q21.5 17 20.23 17.67 L13.27 21.33 Q12 22 10.73 21.33 L3.77 17.67 Q2.5 17 2.5 15.57 L2.5 8.43 Q2.5 7 3.77 6.33 L10.73 2.67 Q12 2 13.27 2.67 Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                />
                <path
                    d="M12 7v10M7.3 9.5 16.7 14.5M16.7 9.5 7.3 14.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity="0.55"
                />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
            {wordmark && (
                <span className="font-semibold tracking-tight text-foreground" style={{ fontSize: size * 0.72 }}>
                    Kubermeister
                </span>
            )}
        </div>
    );
}
