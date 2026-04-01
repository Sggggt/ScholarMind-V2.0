type AppLogoProps = {
  compact?: boolean;
  subtitle?: string;
};

export default function AppLogo({
  compact = false,
  subtitle = 'Research Atelier',
}: AppLogoProps) {
  return (
    <div className={`app-logo${compact ? ' compact' : ''}`}>
      <div className="app-logo-mark" aria-hidden="true">
        <span className="app-logo-ring" />
        <span className="app-logo-letter">S</span>
        <span className="app-logo-dot" />
      </div>
      <div className="app-logo-copy">
        <div className="app-logo-wordmark">ScholarMind</div>
        <div className="app-logo-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}
