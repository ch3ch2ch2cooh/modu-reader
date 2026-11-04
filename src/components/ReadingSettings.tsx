import { FONT_LABELS, FONT_STACKS, THEMES } from '../lib/themes';
import { useSettings } from '../store/settings';
import type { ReaderPrefs, ThemeId } from '../types';

const FONT_SIZES = [16, 17, 18, 19, 20, 21, 22, 24, 26, 28];

export function ReadingSettings() {
  const prefs = useSettings((s) => s.prefs);
  const setPrefs = useSettings((s) => s.setPrefs);
  const theme = THEMES[prefs.themeId];

  const update = (patch: Partial<ReaderPrefs>) => setPrefs(patch);

  return (
    <div className="settings-group">
      <div
        className="reading-preview"
        style={{
          background: theme.bg,
          color: theme.fg,
          borderColor: theme.border,
          fontFamily: FONT_STACKS[prefs.fontFamily],
          fontSize: `${prefs.fontSize}px`,
          lineHeight: prefs.lineHeight,
        }}
      >
        <span className="reading-preview__label">预览</span>
        <p style={{ marginBottom: `${prefs.paragraphSpacing}em` }}>
          夜色渐深，纸页上的字迹在灯下显得格外清晰。
        </p>
        <p>山里的风翻动了书页。</p>
      </div>

      <div className="section-label">背景主题</div>
      <div className="theme-row">
        {Object.values(THEMES).map((theme) => (
          <button
            key={theme.id}
            className={`theme-swatch ${prefs.themeId === theme.id ? 'is-active' : ''}`}
            onClick={() => update({ themeId: theme.id as ThemeId })}
          >
            <span
              className="theme-swatch__circle"
              style={{ background: theme.bg, color: theme.fg, borderColor: theme.border }}
            >
              A
            </span>
            <span>{theme.name}</span>
          </button>
        ))}
      </div>

      <div className="section-label">字体</div>
      <div className="segmented">
        {(Object.keys(FONT_LABELS) as (keyof typeof FONT_LABELS)[]).map((key) => (
          <button
            key={key}
            className={prefs.fontFamily === key ? 'is-active' : ''}
            style={{ fontFamily: FONT_STACKS[key] }}
            onClick={() => update({ fontFamily: key })}
          >
            {FONT_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="slider-row">
        <div className="slider-row__head">
          <span>字号</span>
          <span className="slider-row__value">{prefs.fontSize}px</span>
        </div>
        <div className="slider-with-marks">
          <button
            className="step-button"
            onClick={() => update({ fontSize: Math.max(14, prefs.fontSize - 1) })}
          >
            A−
          </button>
          <input
            type="range"
            min={14}
            max={30}
            step={1}
            value={prefs.fontSize}
            onChange={(event) => update({ fontSize: Number(event.target.value) })}
          />
          <button
            className="step-button"
            onClick={() => update({ fontSize: Math.min(30, prefs.fontSize + 1) })}
          >
            A+
          </button>
        </div>
        <div className="size-presets">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              className={prefs.fontSize === size ? 'is-active' : ''}
              onClick={() => update({ fontSize: size })}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="slider-row">
        <div className="slider-row__head">
          <span>行距</span>
          <span className="slider-row__value">{prefs.lineHeight.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={1.3}
          max={2.5}
          step={0.05}
          value={prefs.lineHeight}
          onChange={(event) => update({ lineHeight: Number(event.target.value) })}
        />
      </div>

      <div className="slider-row">
        <div className="slider-row__head">
          <span>段间距</span>
          <span className="slider-row__value">{prefs.paragraphSpacing.toFixed(2)}em</span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={prefs.paragraphSpacing}
          onChange={(event) => update({ paragraphSpacing: Number(event.target.value) })}
        />
      </div>

      <div className="slider-row">
        <div className="slider-row__head">
          <span>页边距</span>
          <span className="slider-row__value">{prefs.margin}px</span>
        </div>
        <input
          type="range"
          min={10}
          max={44}
          step={2}
          value={prefs.margin}
          onChange={(event) => update({ margin: Number(event.target.value) })}
        />
      </div>

      <div className="setting-toggle">
        <div>
          <strong>音量键翻页</strong>
          <p className="hint-text">阅读时按音量上 / 下键翻页；关闭后恢复系统音量调节。</p>
        </div>
        <button
          className={`switch ${prefs.volumeKeys ? 'is-on' : ''}`}
          role="switch"
          aria-checked={prefs.volumeKeys}
          onClick={() => update({ volumeKeys: !prefs.volumeKeys })}
        >
          <span />
        </button>
      </div>

      <p className="hint-text">字号与页边距对 PDF 表现为整体缩放；PDF 为固定版式，不支持重排。</p>
    </div>
  );
}
