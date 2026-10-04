import { setPreferences, usePreferences, type Preferences } from './preferences';
export function AccessibilitySettings() {
  const prefs = usePreferences();
  return (
    <details className="card flat accessibility-settings">
      <summary>Reading & motion</summary>
      <div className="stack" style={{ marginTop: 'var(--space-10px)' }}>
        <label className="spread">
          Text size
          <select value={prefs.textSize} onChange={(e) => setPreferences({ textSize: e.target.value as Preferences['textSize'] })}>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
            <option value="larger">Extra large</option>
          </select>
        </label>
        <label className="row">
          <input type="checkbox" checked={prefs.reducedMotion} onChange={(e) => setPreferences({ reducedMotion: e.target.checked })} />
          Reduce motion
        </label>
        <small>Your device's reduced-motion preference is also respected.</small>
      </div>
    </details>
  );
}
