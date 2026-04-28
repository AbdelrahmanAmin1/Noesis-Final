// Splash — animated Noēsis intro. Fades in, logo assembles, pulse, fades out.

const Splash = ({ onDone }) => {
  const [phase, setPhase] = React.useState(0);
  // phases: 0 initial, 1 orb grow, 2 wordmark, 3 tagline, 4 fade out

  React.useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 120),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1500),
      setTimeout(() => setPhase(4), 2800),
      setTimeout(() => onDone && onDone(), 3400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  // Skip on click
  const skip = () => { setPhase(4); setTimeout(() => onDone && onDone(), 420); };

  return (
    <div
      onClick={skip}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'radial-gradient(ellipse at center, #12122a 0%, #06061a 70%, #010108 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        cursor: 'pointer',
        opacity: phase === 4 ? 0 : 1,
        transition: 'opacity 480ms cubic-bezier(.4,0,.2,1)',
      }}
    >
      {/* Starfield */}
      <StarCanvas/>

      {/* Orb */}
      <div style={{
        position: 'relative', width: 140, height: 140,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #c99afc, #6366f1 40%, #1e1b4b 80%, transparent)',
          filter: 'blur(2px)',
          transform: phase >= 1 ? 'scale(1)' : 'scale(0.2)',
          opacity: phase >= 1 ? 1 : 0,
          transition: 'all 900ms cubic-bezier(.2,.8,.2,1)',
          boxShadow: '0 0 80px 20px rgba(140, 110, 255, 0.35)',
        }}/>
        <div style={{
          position: 'absolute', inset: -40, borderRadius: '50%',
          border: '1px solid rgba(165, 180, 252, 0.18)',
          opacity: phase >= 1 ? 1 : 0,
          animation: phase >= 1 ? 'splashRing 2.4s ease-out infinite' : 'none',
        }}/>
        <div style={{
          position: 'absolute', inset: -80, borderRadius: '50%',
          border: '1px solid rgba(165, 180, 252, 0.08)',
          opacity: phase >= 1 ? 1 : 0,
          animation: phase >= 1 ? 'splashRing 2.4s ease-out 0.4s infinite' : 'none',
        }}/>
        <img
          src="assets/noesis_logo.webp"
          alt=""
          width={72} height={72}
          style={{
            width: 72, height: 72, objectFit: 'contain', zIndex: 2,
            transform: phase >= 1 ? 'scale(1) rotate(0deg)' : 'scale(0.3) rotate(-25deg)',
            opacity: phase >= 1 ? 1 : 0,
            transition: 'all 1100ms cubic-bezier(.2,.8,.2,1) 120ms',
            filter: 'drop-shadow(0 0 18px rgba(199, 154, 252, 0.6))',
          }}
        />
      </div>

      {/* Wordmark */}
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 300,
        letterSpacing: '-0.025em', color: '#fff', marginTop: 34,
        overflow: 'hidden', display: 'flex',
      }}>
        {'Noēsis'.split('').map((ch, i) => (
          <span key={i} style={{
            display: 'inline-block',
            transform: phase >= 2 ? 'translateY(0)' : 'translateY(100%)',
            opacity: phase >= 2 ? 1 : 0,
            transition: `all 680ms cubic-bezier(.2,.8,.2,1) ${120 + i * 60}ms`,
          }}>{ch}</span>
        ))}
      </div>

      {/* Tagline */}
      <div style={{
        fontSize: 13, letterSpacing: '0.22em', textTransform: 'uppercase',
        color: 'rgba(199, 201, 220, 0.6)', marginTop: 22,
        opacity: phase >= 3 ? 1 : 0,
        transform: phase >= 3 ? 'translateY(0)' : 'translateY(8px)',
        transition: 'all 700ms cubic-bezier(.2,.8,.2,1)',
      }}>
        A calm place to think
      </div>

      {/* Skip hint */}
      <div style={{
        position: 'absolute', bottom: 32, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em',
        opacity: phase >= 3 ? 1 : 0, transition: 'opacity 400ms',
      }}>
        Tap to enter
      </div>

      <style>{`
        @keyframes splashRing {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

const StarCanvas = () => {
  const ref = React.useRef();
  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    const count = 180;
    const stars = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      z: Math.random() * 2 + 0.3,
      tw: Math.random() * Math.PI * 2,
      color: Math.random() > 0.85 ? '#c99afc' : (Math.random() > 0.6 ? '#a5b4fc' : '#ffffff'),
    }));

    let raf;
    const loop = (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.y -= s.z * 0.15;
        if (s.y < 0) s.y = canvas.height;
        const tw = Math.sin(t * 0.002 + s.tw) * 0.5 + 0.5;
        ctx.globalAlpha = 0.25 + tw * 0.65;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, s.z * dpr, s.z * dpr);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return (
    <canvas ref={ref} style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      opacity: 0.6, pointerEvents: 'none',
    }}/>
  );
};

window.Splash = Splash;
