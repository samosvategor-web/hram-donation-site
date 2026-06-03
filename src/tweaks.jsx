// tweaks.jsx — Tweaks panel for the room navigator. Reads window.__nav (set by the
// nav module) and applies live. Controls: motion, camera, render style.
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "autoRotate": true,
  "rotateSpeed": 30,
  "walkSpeed": 6,
  "lookSens": 100,
  "fov": 48,
  "eyeCm": 0,
  "exposure": 112,
  "aoStrength": 100,
  "aoLevel": 40,
  "aoBand": 15,
  "sketchWeight": 100,
  "sunAz": 35,
  "sunElev": 42,
  "sunPower": 200,
  "accent": "#1f4f86",
  "paper": "#e8e5de"
}/*EDITMODE-END*/;

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
  nav.setSketchWeight(t.sketchWeight / 100);
  if (nav.colorSun) {
    nav.setSunAz(t.sunAz);
    nav.setSunElev(t.sunElev);
    nav.setSunIntensity(t.sunPower / 100);
  }
  nav.setPaper(t.paper);
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [hasSun, setHasSun] = React.useState(false);
  React.useEffect(() => { applyTweaks(t); }, [t]);
  // model loads async — keep trying until nav is ready, then apply once
  React.useEffect(() => {
    let id;
    const tryApply = () => {
      if (window.__nav && window.__nav.ready) { applyTweaks(t); setHasSun(!!window.__nav.colorSun); }
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

      <TweakSection label="Свет · гипс" />
      <TweakSlider label="Яркость" value={t.exposure} min={70} max={150} step={2} unit="%"
                   onChange={(v) => setTweak('exposure', v)} />
      <TweakSlider label="Сила теней (AO)" value={t.aoStrength} min={0} max={200} step={5} unit="%"
                   onChange={(v) => setTweak('aoStrength', v)} />
      <TweakSlider label="Уровень смены света" value={t.aoLevel} min={10} max={80} step={5} unit="%"
                   onChange={(v) => setTweak('aoLevel', v)} />
      <TweakSlider label="Плавность смены" value={t.aoBand} min={2} max={30} step={1} unit="%"
                   onChange={(v) => setTweak('aoBand', v)} />

      {hasSun && <TweakSection label="Солнце · цвет" />}
      {hasSun && <TweakSlider label="Направление" value={t.sunAz} min={0} max={360} step={5} unit="°"
                   onChange={(v) => setTweak('sunAz', v)} />}
      {hasSun && <TweakSlider label="Высота" value={t.sunElev} min={10} max={80} step={5} unit="°"
                   onChange={(v) => setTweak('sunElev', v)} />}
      {hasSun && <TweakSlider label="Сила" value={t.sunPower} min={0} max={350} step={10} unit="%"
                   onChange={(v) => setTweak('sunPower', v)} />}

      <TweakSection label="Стиль" />
      <TweakSlider label="Контур наброска" value={t.sketchWeight} min={40} max={220} step={10} unit="%"
                   onChange={(v) => setTweak('sketchWeight', v)} />
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
