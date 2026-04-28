// Three.js 3D hero — floating knowledge-orbit with interactive rotation
const Hero3D = ({ height = 520 }) => {
  const mountRef = React.useRef(null);

  React.useEffect(() => {
    if (!window.THREE) return;
    const THREE = window.THREE;
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth, H = height;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.set(0, 0.3, 6.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const readVar = (name, fallback) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!v) return fallback;
      // accept #rrggbb
      if (v.startsWith('#')) return new THREE.Color(v);
      return new THREE.Color(v || fallback);
    };
    const ACCENT = readVar('--accent', '#a5b4fc');
    const ACCENT2 = readVar('--accent-2', '#c99afc');
    const ACCENT3 = readVar('--accent-3', '#6ad0e8');
    const FG = readVar('--fg-0', '#eeecff');

    // Core: glowing sphere
    const coreMat = new THREE.MeshBasicMaterial({ color: ACCENT });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 48, 48), coreMat);
    scene.add(core);

    // Glow shell
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 32, 32),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.18, side: THREE.BackSide })
    );
    scene.add(glow);

    // Icosahedron wireframe wrapper (lensed glasses feel)
    const ico = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.15, 1),
      new THREE.MeshBasicMaterial({ color: ACCENT2, wireframe: true, transparent: true, opacity: 0.55 })
    );
    scene.add(ico);

    // Three orbit rings
    const rings = [];
    [1.9, 2.5, 3.1].forEach((r, i) => {
      const g = new THREE.TorusGeometry(r, 0.006, 8, 160);
      const m = new THREE.MeshBasicMaterial({
        color: [ACCENT, ACCENT2, ACCENT3][i],
        transparent: true, opacity: 0.35 + i * 0.07,
      });
      const t = new THREE.Mesh(g, m);
      t.rotation.x = Math.PI / 2 + (i - 1) * 0.22;
      t.rotation.y = (i - 1) * 0.35;
      scene.add(t);
      rings.push(t);
    });

    // Orbiting concept nodes
    const nodes = [];
    const concepts = [
      { r: 1.9, a: 0, speed: 0.28, color: ACCENT },
      { r: 1.9, a: Math.PI * 2 / 3, speed: 0.28, color: ACCENT },
      { r: 1.9, a: Math.PI * 4 / 3, speed: 0.28, color: ACCENT },
      { r: 2.5, a: 0.6, speed: -0.22, color: ACCENT2 },
      { r: 2.5, a: 0.6 + Math.PI, speed: -0.22, color: ACCENT2 },
      { r: 3.1, a: 0.2, speed: 0.16, color: ACCENT3 },
      { r: 3.1, a: 0.2 + Math.PI * 0.8, speed: 0.16, color: ACCENT3 },
    ];
    concepts.forEach(c => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 16, 16),
        new THREE.MeshBasicMaterial({ color: c.color })
      );
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 16, 16),
        new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.22 })
      );
      m.add(halo);
      scene.add(m);
      nodes.push({ mesh: m, ...c });
    });

    // Starfield
    const starGeo = new THREE.BufferGeometry();
    const starCount = 600;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 18 + Math.random() * 14;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: FG, size: 0.03, transparent: true, opacity: 0.7, sizeAttenuation: true })
    );
    scene.add(stars);

    // Mouse parallax
    let mx = 0, my = 0, tx = 0, ty = 0;
    const onMove = (e) => {
      const rect = mount.getBoundingClientRect();
      mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      my = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    mount.addEventListener('mousemove', onMove);

    // Resize
    const onResize = () => {
      const nw = mount.clientWidth;
      renderer.setSize(nw, height);
      camera.aspect = nw / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    let raf;
    const start = performance.now();
    const animate = (now) => {
      const t = (now - start) / 1000;
      tx += (mx * 0.35 - tx) * 0.06;
      ty += (my * 0.25 - ty) * 0.06;
      camera.position.x = tx;
      camera.position.y = 0.3 - ty;
      camera.lookAt(0, 0, 0);

      ico.rotation.y = t * 0.15;
      ico.rotation.x = Math.sin(t * 0.4) * 0.2;
      glow.scale.setScalar(1 + Math.sin(t * 1.8) * 0.04);

      rings.forEach((r, i) => {
        r.rotation.z = t * (0.06 - i * 0.02);
      });

      nodes.forEach(n => {
        const ang = n.a + t * n.speed;
        n.mesh.position.x = Math.cos(ang) * n.r;
        n.mesh.position.z = Math.sin(ang) * n.r;
        n.mesh.position.y = Math.sin(ang * 1.3) * 0.35;
      });

      stars.rotation.y = t * 0.01;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      mount.removeEventListener('mousemove', onMove);
      mount.contains(renderer.domElement) && mount.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse(o => {
        o.geometry && o.geometry.dispose();
        o.material && o.material.dispose && o.material.dispose();
      });
    };
  }, [height]);

  return (
    <div ref={mountRef} style={{
      width: '100%', height, position: 'relative',
      cursor: 'grab',
    }}>
      {/* center mark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        color: 'var(--bg-0)',
        fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400,
        mixBlendMode: 'screen',
      }}>
        <span style={{ color: 'var(--fg-0)', opacity: 0.9, textShadow: '0 0 24px var(--accent)' }}>ō</span>
      </div>
    </div>
  );
};

window.Hero3D = Hero3D;
