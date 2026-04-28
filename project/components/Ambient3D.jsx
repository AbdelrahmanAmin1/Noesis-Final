// Ambient3D — subtle background 3D. Low-cost, non-interactive, themeable.
// Used as fixed background behind marketing pages & dashboard for atmosphere.

const Ambient3D = ({ opacity = 0.5, variant = 'mesh' }) => {
  const mountRef = React.useRef(null);

  React.useEffect(() => {
    if (!window.THREE) return;
    const THREE = window.THREE;
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || window.innerWidth;
    const H = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 100);
    camera.position.set(0, 0, 9);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const readVar = (n, f) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return new THREE.Color(v || f);
    };
    const ACCENT = readVar('--accent', '#a5b4fc');
    const ACCENT2 = readVar('--accent-2', '#c99afc');
    const ACCENT3 = readVar('--accent-3', '#6ad0e8');

    // Layer 1: drifting wireframe polyhedra
    const shapes = [];
    const geoms = [
      () => new THREE.IcosahedronGeometry(0.7, 0),
      () => new THREE.OctahedronGeometry(0.6, 0),
      () => new THREE.TorusGeometry(0.6, 0.04, 6, 40),
      () => new THREE.DodecahedronGeometry(0.55, 0),
    ];
    const palette = [ACCENT, ACCENT2, ACCENT3];
    for (let i = 0; i < 8; i++) {
      const geo = geoms[i % geoms.length]();
      const color = palette[i % palette.length];
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.28 })
      );
      m.position.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6 - 2
      );
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      m.userData = {
        driftX: (Math.random() - 0.5) * 0.08,
        driftY: (Math.random() - 0.5) * 0.06,
        rotX: (Math.random() - 0.5) * 0.15,
        rotY: (Math.random() - 0.5) * 0.15,
        baseY: m.position.y,
        phase: Math.random() * Math.PI * 2,
      };
      scene.add(m);
      shapes.push(m);
    }

    // Layer 2: particle cloud
    const pCount = 400;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 20;
      pPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ color: ACCENT, size: 0.04, transparent: true, opacity: 0.6, sizeAttenuation: true })
    );
    scene.add(particles);

    // Mouse parallax
    let mx = 0, my = 0, tx = 0, ty = 0;
    const onMove = (e) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove);

    const onResize = () => {
      const nw = mount.clientWidth || window.innerWidth;
      const nh = mount.clientHeight || window.innerHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf;
    const start = performance.now();
    const animate = (now) => {
      const t = (now - start) / 1000;
      tx += (mx * 0.4 - tx) * 0.03;
      ty += (my * 0.25 - ty) * 0.03;
      camera.position.x = tx;
      camera.position.y = -ty;
      camera.lookAt(0, 0, 0);

      shapes.forEach(s => {
        s.rotation.x += s.userData.rotX * 0.01;
        s.rotation.y += s.userData.rotY * 0.01;
        s.position.y = s.userData.baseY + Math.sin(t * 0.4 + s.userData.phase) * 0.3;
      });

      particles.rotation.y = t * 0.015;
      particles.rotation.x = Math.sin(t * 0.1) * 0.05;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', onResize);
      mount.contains(renderer.domElement) && mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse(o => {
        o.geometry && o.geometry.dispose();
        o.material && o.material.dispose && o.material.dispose();
      });
    };
  }, [variant]);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 0,
        pointerEvents: 'none', opacity,
        transition: 'opacity 600ms var(--ease-out)',
      }}
    />
  );
};

window.Ambient3D = Ambient3D;
