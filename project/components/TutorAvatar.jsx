// Animated CSS/SVG tutor avatar for free-form chat states.
const TutorAvatar = ({ state = 'idle', size = 100 }) => {
  React.useEffect(() => {
    if (document.getElementById('noesis-tutor-avatar-css')) return;
    const style = document.createElement('style');
    style.id = 'noesis-tutor-avatar-css';
    style.textContent = TUTOR_AVATAR_CSS;
    document.head.appendChild(style);
  }, []);

  const safeState = ['idle', 'listening', 'thinking', 'speaking', 'error'].includes(state) ? state : 'idle';
  const px = Number(size) || 100;

  return (
    <div
      className={`tutor-avatar tutor-avatar-${safeState}`}
      style={{ width: px, height: px }}
      aria-label={`Tutor avatar ${safeState}`}
      title={`Tutor is ${safeState}`}
    >
      <span className="tutor-avatar-ring tutor-avatar-ring-a"/>
      <span className="tutor-avatar-ring tutor-avatar-ring-b"/>

      <div className="tutor-avatar-core">
        <svg viewBox="0 0 100 100" className="tutor-avatar-face" role="img" aria-hidden="true">
          <defs>
            <linearGradient id="tutorAvatarFaceGrad" x1="18" y1="8" x2="88" y2="92">
              <stop offset="0%" stopColor="var(--fg-0)" stopOpacity="0.95"/>
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.82"/>
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="33" fill="var(--bg-0)" opacity="0.78"/>
          <path d="M27 48c4-13 14-20 23-20s19 7 23 20c-6-6-14-9-23-9s-17 3-23 9z" fill="var(--accent-glow)" stroke="var(--accent-soft)" strokeWidth="1.2"/>
          <circle className="tutor-avatar-eye tutor-avatar-eye-left" cx="39" cy="51" r="3.2" fill="url(#tutorAvatarFaceGrad)"/>
          <circle className="tutor-avatar-eye tutor-avatar-eye-right" cx="61" cy="51" r="3.2" fill="url(#tutorAvatarFaceGrad)"/>
          <path className="tutor-avatar-mouth" d="M38 64c7 6 17 6 24 0" fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round"/>
        </svg>

        <div className="tutor-avatar-think-dots">
          <span/>
          <span/>
          <span/>
        </div>

        <div className="tutor-avatar-sound tutor-avatar-sound-left">
          <span/>
          <span/>
          <span/>
        </div>
        <div className="tutor-avatar-sound tutor-avatar-sound-right">
          <span/>
          <span/>
          <span/>
        </div>
      </div>
    </div>
  );
};

const TUTOR_AVATAR_CSS = `
.tutor-avatar {
  --avatar-state: var(--accent);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--accent);
}
.tutor-avatar-core {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 30%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 34% 24%, rgba(255,255,255,0.24), transparent 26%),
    radial-gradient(circle at 72% 76%, var(--accent-glow), transparent 42%),
    linear-gradient(135deg, var(--bg-2), var(--bg-1));
  border: 1px solid var(--accent-soft);
  box-shadow: 0 14px 42px -22px var(--avatar-state), inset 0 0 30px var(--accent-glow);
  transition: border-color 260ms var(--ease-out), box-shadow 260ms var(--ease-out), transform 260ms var(--ease-out), background 260ms var(--ease-out);
  animation: tutor-avatar-bob 3.4s ease-in-out infinite;
}
.tutor-avatar-face {
  width: 82%;
  height: 82%;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,0.12));
}
.tutor-avatar-ring {
  position: absolute;
  inset: 3%;
  border-radius: 32%;
  border: 1px solid var(--accent-soft);
  opacity: 0;
  pointer-events: none;
}
.tutor-avatar-think-dots,
.tutor-avatar-sound {
  position: absolute;
  pointer-events: none;
  opacity: 0;
}
.tutor-avatar-think-dots {
  left: 50%;
  bottom: 14%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
}
.tutor-avatar-think-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  animation: tutor-avatar-think-dot 920ms ease-in-out infinite;
}
.tutor-avatar-think-dots span:nth-child(2) { animation-delay: 120ms; }
.tutor-avatar-think-dots span:nth-child(3) { animation-delay: 240ms; }
.tutor-avatar-sound {
  top: 34%;
  display: flex;
  align-items: center;
  gap: 3px;
}
.tutor-avatar-sound-left { left: 7%; }
.tutor-avatar-sound-right { right: 7%; }
.tutor-avatar-sound span {
  width: 3px;
  height: 13px;
  border-radius: 999px;
  background: var(--accent);
  animation: tutor-avatar-sound-bar 520ms ease-in-out infinite;
}
.tutor-avatar-sound span:nth-child(2) { animation-delay: 120ms; }
.tutor-avatar-sound span:nth-child(3) { animation-delay: 240ms; }
.tutor-avatar-listening .tutor-avatar-core {
  transform: translateY(-1px) scale(1.015);
  box-shadow: 0 18px 50px -20px var(--accent), inset 0 0 34px var(--accent-glow);
}
.tutor-avatar-listening .tutor-avatar-ring {
  animation: tutor-avatar-listen-ring 1.25s ease-out infinite;
}
.tutor-avatar-listening .tutor-avatar-ring-b { animation-delay: 420ms; }
.tutor-avatar-thinking .tutor-avatar-core {
  animation: tutor-avatar-bob 3.4s ease-in-out infinite, tutor-avatar-dashed 1.25s linear infinite;
  border-style: dashed;
}
.tutor-avatar-thinking .tutor-avatar-think-dots { opacity: 1; }
.tutor-avatar-speaking .tutor-avatar-core {
  transform: scale(1.02);
  box-shadow: 0 20px 56px -18px var(--accent), inset 0 0 38px var(--accent-glow);
}
.tutor-avatar-speaking .tutor-avatar-mouth {
  animation: tutor-avatar-mouth 380ms ease-in-out infinite;
  transform-origin: 50% 64%;
}
.tutor-avatar-speaking .tutor-avatar-sound { opacity: 0.9; }
.tutor-avatar-error { --avatar-state: var(--err); color: var(--err); }
.tutor-avatar-error .tutor-avatar-core {
  border-color: var(--err);
  animation: tutor-avatar-error-shake 420ms ease-in-out 1;
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--err) 16%, transparent), 0 16px 44px -20px var(--err);
}
.tutor-avatar-error .tutor-avatar-mouth { stroke: var(--err); }
@keyframes tutor-avatar-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
@keyframes tutor-avatar-listen-ring {
  0% { opacity: 0.55; transform: scale(0.86); }
  100% { opacity: 0; transform: scale(1.32); }
}
@keyframes tutor-avatar-think-dot {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
  40% { transform: translateY(-5px); opacity: 1; }
}
@keyframes tutor-avatar-sound-bar {
  0%, 100% { transform: scaleY(0.45); opacity: 0.42; }
  50% { transform: scaleY(1.15); opacity: 1; }
}
@keyframes tutor-avatar-mouth {
  0%, 100% { transform: scaleY(0.72); }
  50% { transform: scaleY(1.28); }
}
@keyframes tutor-avatar-error-shake {
  0%, 100% { transform: translateX(0); }
  22% { transform: translateX(-3px); }
  44% { transform: translateX(3px); }
  66% { transform: translateX(-2px); }
}
@keyframes tutor-avatar-dashed {
  0%, 100% { filter: hue-rotate(0deg); }
  50% { filter: hue-rotate(10deg); }
}
@media (prefers-reduced-motion: reduce) {
  .tutor-avatar-core,
  .tutor-avatar-ring,
  .tutor-avatar-thinking span,
  .tutor-avatar-sound span,
  .tutor-avatar-mouth {
    animation: none !important;
  }
}
`;

window.TutorAvatar = TutorAvatar;
