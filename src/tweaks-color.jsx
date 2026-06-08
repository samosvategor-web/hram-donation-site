// tweaks-color.jsx — Tweaks panel for the colour-only interior tour. Reads
// window.__nav (set by the nav module) and applies live. Trimmed vs the shared
// panel: the render mode is locked to "Цвет", so the sketch-outline control is
// gone and the light section is just "Свет".
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "autoRotate": true,
  "rotateSpeed": 30,
  "walkSpeed": 6,
  "lookSens": 100,
  "fov": 48,
  "eyeCm": 0,
  "exposure": 104,
  "aoStrength": 100,
  "aoLevel": 40,
  "aoBand": 15,
  "sunAz": 35,
  "sunElev": 55,
  "sunPower": 60,
  "accent": "#1f4f86",
  "paper": "#e8e5de"
}/*EDITMODE-END*/;

const TWEAK_BASE = Object.assign({}, TWEAK_DEFAULTS, window.TWEAK_OVERRIDES || {});

function applyTweaks(t) {
  const r = document.documentElement;
  r.style.setProperty('--accent', t.accent);
  r.style.setProperty('--paper', t.paper);
  const nav = window.__nav;
  if (!nav || !nav.ready) return;
  nav.setAutoRotate(t.autoRotate);
  nav.setAutoSpeed((t.rotateSpeed / 100) * 0.28);
  nav.setWalkSpeed(t.walkSpeed);
  nav.setLookSens(t.lookSens / 100);
  nav.setFov(t.fov);
  nav.setEyeOffset(t.eyeCm / 100);
  nav.setExposure(t.exposure / 100);
  nav.setAoStrength(t.aoStrength / 100);
  nav.setAoLevel(t.aoLevel / 100);
  nav.setAoBand(Math.max(0.02, t.aoBand / 100));
  nav.setSunAz(t.sunAz);
  nav.setSunElev(t.sunElev);
  nav.setSunIntensity(t.sunPower / 100);
  nav.setPaper(t.paper);
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_BASE);
  React.useEffect(() => { applyTweaks(t); }, [t]);
  // model loads async — keep trying until nav is ready, then apply once
  React.useEffect(() => {
    let id;
    const tryApply = () => {
      if (window.__nav && window.__nav.ready) applyTweaks(t);
      else id = setTimeout(tryApply, 150);
    };
    tryApply();
    return () => clearTimeout(id);
  }, []);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Движение" />
      <TweakToggle label="Автовращение 3/4" value={t.autoRotate}
                   onChange={(v) => setTweak('autoRotate', v)} />
      <TweakSlider label="Скорость вращения" value={t.rotateSpeed} min={0} max={100} step={5} unit="%"
                   onChange={(v) => setTweak('rotateSpeed', v)} />
      <TweakSlider label="Скорость ходьбы" value={t.walkSpeed} min={2} max={14} step={0.5} unit=" м/с"
                   onChange={(v) => setTweak('walkSpeed', v)} />
      <TweakSlider label="Чувствит. взгляда" value={t.lookSens} min={40} max={200} step={5} unit="%"
                   onChange={(v) => setTweak('lookSens', v)} />

      <TweakSection label="Камера" />
      <TweakSlider label="Угол обзора" value={t.fov} min={35} max={75} step={1} unit="°"
                   onChange={(v) => setTweak('fov', v)} />
      <TweakSlider label="Высота глаз" value={t.eyeCm} min={-60} max={80} step={5} unit=" см"
                   onChange={(v) => setTweak('eyeCm', v)} />

      <TweakSection label="Свет" />
      <TweakSlider label="Яркость" value={t.exposure} min={70} max={150} step={2} unit="%"
                   onChange={(v) => setTweak('exposure', v)} />
      <TweakSlider label="Направление солнца" value={t.sunAz} min={0} max={360} step={5} unit="°"
                   onChange={(v) => setTweak('sunAz', v)} />
      <TweakSlider label="Высота солнца" value={t.sunElev} min={10} max={80} step={5} unit="°"
                   onChange={(v) => setTweak('sunElev', v)} />
      <TweakSlider label="Сила солнца" value={t.sunPower} min={0} max={200} step={5} unit="%"
                   onChange={(v) => setTweak('sunPower', v)} />
      <TweakSlider label="Сила теней (AO)" value={t.aoStrength} min={0} max={200} step={5} unit="%"
                   onChange={(v) => setTweak('aoStrength', v)} />

      <TweakSection label="Цвет" />
      <TweakColor label="Акцент" value={t.accent}
                  options={['#1f4f86', '#b5573a', '#2f6b4f', '#2a2a2a']}
                  onChange={(v) => setTweak('accent', v)} />
      <TweakColor label="Фон" value={t.paper}
                  options={['#e8e5de', '#e3e5e8', '#f4f3ef', '#ece3d2']}
                  onChange={(v) => setTweak('paper', v)} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<App />);
