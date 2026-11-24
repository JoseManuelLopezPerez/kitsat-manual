/* Flipbook del manual KIT-SAT. Sin dependencias.
 * Lee paginas.json (lo genera construir.py) y config.json (secciones, a mano). */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const escenario = $("escenario");
  const libro = $("libro");
  const hojaIzq = $("hojaIzq");
  const hojaDer = $("hojaDer");
  const deslizador = $("deslizador");
  const contador = $("contador");

  let version = "";
  const ruta = (n) => `paginas/${String(n).padStart(2, "0")}.webp${version}`;
  const rutaMini = (n) => `miniaturas/${String(n).padStart(2, "0")}.webp${version}`;
  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  let total = 1;
  let proporcion = 396 / 612;
  let secciones = [];
  let pagina = 1;            // página de referencia (1..total)
  let doble = true;          // dos páginas a la vez o una
  let ancho = 0;             // ancho de una página en px de pantalla
  let giro = null;           // hoja que está girando
  let objetivo = 0;          // página a la que hay que llegar al terminar el giro actual
  let prisa = false;         // hay una orden nueva: el giro actual termina rápido
  let sonido = localStorage.getItem("flip-sonido") === "1";
  // dos páginas a la vez es lo predeterminado, también en teléfono
  let modo = localStorage.getItem("flip-modo") === "sencillo" ? "sencillo" : "doble";

  /* ---------- Qué páginas se ven ---------- */

  const valida = (n) => n >= 1 && n <= total;

  function vista(p = pagina) {
    if (!doble) return { izq: 0, der: p };
    const k = Math.floor(p / 2);
    return { izq: valida(2 * k) ? 2 * k : 0, der: valida(2 * k + 1) ? 2 * k + 1 : 0 };
  }

  function destino(dir, p = pagina) {
    if (!doble) return valida(p + dir) ? p + dir : 0;
    const k = Math.floor(p / 2) + dir;
    if (k < 0 || 2 * k > total) return 0;
    return k === 0 ? 1 : 2 * k;
  }

  /* ---------- Imágenes ---------- */

  const precargadas = new Map();
  function precargar(n) {
    if (!valida(n) || precargadas.has(n)) return precargadas.get(n);
    const im = new Image();
    im.decoding = "async";
    im.src = ruta(n);
    const lista = im.decode().catch(() => {});
    precargadas.set(n, lista);
    return lista;
  }
  function vecinas() {
    const v = vista();
    for (let d = -3; d <= 4; d++) precargar((v.der || v.izq) + d);
  }
  // espera a que las imágenes estén listas, pero nunca deja al lector esperando mucho
  const listas = (...ns) =>
    Promise.race([Promise.all(ns.filter(valida).map(precargar)), new Promise((r) => setTimeout(r, prisa ? 250 : 500))]);

  function cara(n, lado, extra = "") {
    const div = document.createElement("div");
    div.className = `cara lado-${lado} ${extra}`;
    if (n === "papel") {
      div.classList.add("papel");
    } else if (!valida(n)) {
      div.classList.add("vacia");
    } else {
      const im = document.createElement("img");
      im.src = ruta(n);
      im.alt = `Página ${n}`;
      im.decoding = "async";
      im.draggable = false;
      div.appendChild(im);
    }
    return div;
  }

  // cambia la página de una hoja sin parpadeo: la imagen nueva se decodifica
  // antes de sustituir a la anterior, y si es la misma página no se toca
  function pintar(hoja, n, lado) {
    const clave = `${n}|${lado}`;
    if (hoja.dataset.clave === clave) return Promise.resolve();
    hoja.dataset.clave = clave;
    const nueva = cara(n, lado);
    const im = nueva.querySelector("img");
    const poner = () => { if (hoja.dataset.clave === clave) hoja.replaceChildren(nueva); };
    if (!im) {
      poner();
      return Promise.resolve();
    }
    return Promise.race([im.decode().catch(() => {}), new Promise((r) => setTimeout(r, 500))]).then(poner);
  }

  /* ---------- Medidas ---------- */

  function medir() {
    const r = escenario.getBoundingClientRect();
    const chico = innerWidth <= 700 || innerHeight <= 500; // teléfono, vertical u horizontal
    const margenX = chico ? 10 : 240; // espacio para flechas y pestañas
    const margenY = chico ? (innerHeight <= 500 ? 10 : 20) : 40;
    const W = r.width - margenX;
    const H = r.height - margenY;
    const antes = doble;
    doble = modo === "doble";
    ancho = Math.floor(Math.min(H * proporcion, doble ? W / 2 : W));
    const alto = Math.round(ancho / proporcion);
    libro.style.setProperty("--ancho", `${ancho}px`);
    libro.style.setProperty("--alto", `${alto}px`);
    libro.style.width = `${doble ? ancho * 2 : ancho}px`;
    libro.style.height = `${alto}px`;
    libro.classList.toggle("sencillo", !doble);
    if (antes !== doble) mostrar();
    centrar();
  }

  function centrar(v = vista()) {
    let d = 0;
    if (doble && !v.izq) d = -ancho / 2;
    if (doble && !v.der) d = ancho / 2;
    libro.style.setProperty("--desplazar", `${d}px`);
  }

  /* ---------- Mostrar sin animación ---------- */

  function mostrar() {
    const v = vista();
    const listo = Promise.all([pintar(hojaIzq, v.izq, "izq"), pintar(hojaDer, v.der, "der")]);
    centrar(v);
    actualizarUI();
    vecinas();
    return listo;
  }

  const mismoPliego = (x, y) => {
    const a = vista(x);
    const b = vista(y);
    return a.izq === b.izq && a.der === b.der;
  };

  // mientras gira una hoja, la orden nueva se guarda y la hoja actual se apresura
  function pedir(n) {
    objetivo = n;
    prisa = true;
  }

  // ir a cualquier página: si está lejos se salta directo al pliego anterior
  // y solo se anima la última hoja, para que se entienda hacia dónde se fue
  async function irA(n, animado = true) {
    n = limitar(Math.round(n) || 1, 1, total);
    if (giro) {
      pedir(n);
      return;
    }
    if (asomo) {
      asomo.terminar(false);
      asomo = null;
    }
    if (mismoPliego(n, pagina)) return;
    const dir = n > pagina ? 1 : -1;
    if (!animado) {
      pagina = n;
      mostrar();
      return;
    }
    const antes = destino(-dir, n);
    if (antes && !mismoPliego(antes, pagina)) {
      giro = { cargando: true, nueva: n };
      const va = vista(antes);
      const vn = vista(n);
      await listas(va.izq, va.der, vn.izq, vn.der);
      pagina = antes;
      await mostrar();
      giro = null;
    }
    voltear(dir);
  }


  /* ---------- Hoja que se dobla como papel ----------
   * Geometría clásica de "page curl": la esquina C de la hoja se lleva al punto P.
   * El pliegue es la mediatriz de C-P. Lo que queda del lado de C se dobla:
   * se refleja sobre el pliegue y muestra el reverso (la página siguiente).
   * Coordenadas "de giro": x = distancia al lomo (0..ancho), y = 0..alto. */

  const resta = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const punto = (a, b) => a[0] * b[0] + a[1] * b[1];
  const largo = (a) => Math.hypot(a[0], a[1]);

  function recortar(poli, M, n, positivo) {
    const s = positivo ? 1 : -1;
    const fuera = [];
    for (let i = 0; i < poli.length; i++) {
      const A = poli[i];
      const B = poli[(i + 1) % poli.length];
      const da = s * punto(resta(A, M), n);
      const db = s * punto(resta(B, M), n);
      if (da >= 0) fuera.push(A);
      if ((da >= 0) !== (db >= 0)) {
        const k = da / (da - db);
        fuera.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]);
      }
    }
    return fuera;
  }

  function reflejar(X, M, n) {
    const d = 2 * punto(resta(X, M), n);
    return [X[0] - d * n[0], X[1] - d * n[1]];
  }

  const poligono = (pts) =>
    pts.length < 3 ? "polygon(0 0, 0 0, 0 0)" : `polygon(${pts.map((p) => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`).join(",")})`;

  // la hoja no se puede despegar del lomo: limita P a lo que el papel alcanza
  function sujetar(P, C, W, H) {
    const cerca = C[1] > 0 ? [0, H] : [0, 0];
    const lejos = C[1] > 0 ? [0, 0] : [0, H];
    const circulo = (P, O, r) => {
      const d = resta(P, O);
      const l = largo(d);
      return l <= r ? P : [O[0] + (d[0] / l) * r, O[1] + (d[1] / l) * r];
    };
    P = circulo(P, cerca, W);
    return circulo(P, lejos, Math.hypot(W, H) - 0.5);
  }

  function capa(clase) {
    const d = document.createElement("div");
    d.className = clase;
    return d;
  }

  function imagen(n, clase) {
    const d = capa(clase);
    if (n === "papel") d.classList.add("papel");
    else if (valida(n)) {
      const im = document.createElement("img");
      im.src = ruta(n);
      im.alt = "";
      im.draggable = false;
      d.appendChild(im);
    }
    return d;
  }

  function crearGiro(dir, esquinaArriba = false, mover = true) {
    const nueva = destino(dir);
    if (!nueva) return null;
    const a = vista();
    const b = vista(nueva);
    const W = ancho;
    const H = Math.round(ancho / proporcion);
    const lomo = doble ? W : 0;

    // s = +1 si gira la hoja derecha, -1 si gira la izquierda
    let s, nFrente, nDorso, regreso = false;
    if (doble) {
      s = dir > 0 ? 1 : -1;
      nFrente = dir > 0 ? a.der : a.izq;
      nDorso = dir > 0 ? b.izq : b.der;
      if (dir > 0) pintar(hojaDer, b.der, "der");
      else pintar(hojaIzq, b.izq, "izq");
    } else {
      // en una sola página la hoja siempre cuelga del borde izquierdo
      s = 1;
      nFrente = dir > 0 ? a.der : b.der;
      nDorso = "papel";
      regreso = dir < 0;
      if (dir > 0) pintar(hojaDer, b.der, "der");
    }

    const raiz = capa("doblez");
    const bajo = capa("doblez-bajo");
    const bajoLuz = capa("degradado");
    bajo.appendChild(bajoLuz);

    const frente = capa("doblez-frente");
    // las caras que giran llevan la misma sombra de lomo que las hojas quietas
    const frenteImg = imagen(nFrente, `doblez-img lado-${doble && s < 0 ? "izq" : "der"}`);
    frenteImg.style.left = `${doble ? (s > 0 ? W : 0) : 0}px`;
    const frenteLuz = capa("degradado");
    frente.append(frenteImg, frenteLuz);

    const sombra = capa("doblez-sombra");
    const dorso = capa("doblez-dorso");
    const dorsoImg = imagen(nDorso, `doblez-img lado-${s > 0 ? "izq" : "der"}`);
    const dorsoLuz = capa("degradado");
    dorso.append(dorsoImg, dorsoLuz);
    sombra.appendChild(dorso);

    raiz.append(bajo, frente, sombra);
    libro.appendChild(raiz);

    const C = [W, esquinaArriba ? 0 : H];
    const volteada = [-W, C[1]];
    const P0 = regreso ? volteada : C;
    const P1 = regreso ? C : volteada;
    const aLibro = (X) => [lomo + s * X[0], X[1]];
    const delDorso = (u) => (s > 0 && doble ? [W - u[0], u[1]] : [u[0], u[1]]);
    const rect = [[0, 0], [W, 0], [W, H], [0, H]];
    const G = Math.ceil(Math.hypot(W, H) * 2);

    function orientar(el, Mb, d, fondo, opacidad) {
      const ang = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
      el.style.cssText = `left:${Mb[0]}px;top:${Mb[1] - G}px;width:${G}px;height:${2 * G}px;transform:rotate(${ang}deg);background:${fondo};opacity:${opacidad.toFixed(3)}`;
    }

    const g = {
      dir,
      nueva,
      P: P0,
      P0,
      P1,
      C,
      s,
      avance() {
        return limitar((P0[0] - g.P[0]) / (P0[0] - P1[0]), 0, 1);
      },
      fijar(P) {
        P = sujetar(P, C, W, H);
        g.P = P;
        const v = resta(C, P);
        const l = largo(v);
        if (l < 0.5) {
          frente.style.clipPath = "none";
          bajo.style.display = sombra.style.display = "none";
          return;
        }
        bajo.style.display = sombra.style.display = "";
        const n = [v[0] / l, v[1] / l];
        const M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
        const solapa = recortar(rect, M, n, true);

        frente.style.clipPath = poligono(recortar(rect, M, n, false).map(aLibro));
        bajo.style.clipPath = poligono(solapa.map(aLibro));
        dorso.style.clipPath = poligono(solapa.map((X) => aLibro(reflejar(X, M, n))));

        // la imagen del dorso: reflejo del papel sobre el pliegue
        const f = (u) => aLibro(reflejar(delDorso(u), M, n));
        const o = f([0, 0]);
        const ex = resta(f([1, 0]), o);
        const ey = resta(f([0, 1]), o);
        dorsoImg.style.transform = `matrix(${ex[0]},${ex[1]},${ey[0]},${ey[1]},${o[0]},${o[1]})`;

        // luces y sombras que dan la curvatura del papel
        const Mb = aLibro(M);
        const nb = [s * n[0], n[1]];
        const d = l / 2;
        const anchoSombra = Math.min(d, W * 0.45) * 0.9 + 8;
        // al acercarse a su destino la hoja queda plana: las luces se apagan poco a poco
        // para que coincida exactamente con la hoja quieta que la sustituye
        const k = limitar(largo(resta(P, P1)) / (W * 0.4), 0, 1);
        const kSuave = k * k * (3 - 2 * k);
        orientar(bajoLuz, Mb, nb,
          `linear-gradient(to right, rgba(0,0,0,.42) 0, rgba(0,0,0,.18) ${anchoSombra * 0.35}px, transparent ${anchoSombra}px)`, kSuave);
        orientar(dorsoLuz, Mb, [-nb[0], -nb[1]],
          `linear-gradient(to right, rgba(0,0,0,.30) 0, rgba(0,0,0,.06) ${Math.max(4, d * 0.08)}px, rgba(255,255,255,.35) ${Math.max(10, d * 0.22)}px, rgba(255,255,255,0) ${Math.max(20, d * 0.55)}px, rgba(0,0,0,.08) ${Math.max(40, d * 1.6)}px)`, kSuave);
        orientar(frenteLuz, Mb, [-nb[0], -nb[1]],
          `linear-gradient(to right, rgba(0,0,0,.18) 0, transparent ${Math.max(6, d * 0.12)}px)`, kSuave);
        sombra.style.filter = `drop-shadow(${(-nb[0] * 6).toFixed(1)}px ${(-nb[1] * 6 + 4).toFixed(1)}px ${Math.min(18, 4 + d * 0.06).toFixed(1)}px rgba(0,0,0,${(0.28 * kSuave).toFixed(3)}))`;

        if (!doble) sombra.style.opacity = (1 - Math.max(0, (g.avance() - 0.55) / 0.45)).toFixed(3);
      },
      terminar(completo) {
        if (giro && giro !== g) {
          raiz.remove(); // otro giro sigue activo
          return;
        }
        if (completo) pagina = nueva;
        // primero quedan listas las hojas quietas; después se quita la que giró
        mostrar().then(() => setTimeout(() => raiz.remove(), 0));
        giro = null;
        if (objetivo) {
          const n = objetivo;
          objetivo = 0;
          prisa = false;
          if (!mismoPliego(n, pagina)) irA(n);
        }
      },
    };
    g.fijar(P0);
    g.centrar = () => { if (doble) centrar(b); };
    if (mover) g.centrar();
    return g;
  }

  // mueve la esquina en un arco, como cuando una mano levanta la hoja
  function animar(g, hacia, duracion, completo) {
    let desde = g.P;
    const dist = largo(resta(hacia, desde));
    let dur = Math.max(140, (duracion * dist) / (2 * ancho));
    const alto = Math.round(ancho / proporcion);
    let arco = (hacia[1] > 0 ? -1 : 1) * Math.min(alto * 0.16, dist * 0.18);
    let inicio = performance.now();
    let apurado = false;
    return new Promise((fin) => {
      const paso = (ahora) => {
        if (prisa && !apurado) {
          // llegó otra orden: esta hoja termina de caer en un instante
          apurado = true;
          desde = g.P;
          inicio = ahora;
          dur = 170;
          arco = 0;
        }
        const p = limitar((ahora - inicio) / dur, 0, 1);
        const e = suave(p);
        g.fijar([
          desde[0] + (hacia[0] - desde[0]) * e,
          desde[1] + (hacia[1] - desde[1]) * e + Math.sin(Math.PI * e) * arco,
        ]);
        if (p < 1) requestAnimationFrame(paso);
        else {
          g.terminar(completo);
          fin();
        }
      };
      requestAnimationFrame(paso);
    });
  }

  async function voltear(dir, duracion = 900) {
    if (asomo && asomo.dir === dir && !asomo.anim) {
      const g = asomo;
      asomo = null;
      giro = g;
      g.centrar();
      sonar();
      await animar(g, g.P1, duracion, true);
      return;
    }
    if (giro) {
      // clics rápidos: se cuenta a dónde quiere llegar y solo se anima la última hoja
      const base = objetivo || giro.nueva || pagina;
      const sig = destino(dir, base);
      if (sig) pedir(sig);
      return;
    }
    if (!destino(dir)) {
      rebotar(dir);
      return;
    }
    const b = vista(destino(dir));
    giro = { cargando: true, nueva: destino(dir) };
    await listas(b.izq, b.der);
    giro = crearGiro(dir);
    if (!giro) return;
    sonar();
    await animar(giro, giro.P1, duracion, true);
  }

  function rebotar(dir) {
    libro.animate(
      [{ translate: "0" }, { translate: `${-dir * 10}px` }, { translate: "0" }],
      { duration: 260, easing: "ease-out" }
    );
  }

  /* ---------- Arrastrar la esquina con el dedo o el mouse ---------- */

  let toque = null;
  let asomo = null; // esquina levantada al pasar el mouse

  function enGiro(e, r, s) {
    const lomo = doble ? ancho : 0;
    return [s * (e.clientX - r.left - lomo), e.clientY - r.top];
  }

  function cancelarAsomo() {
    if (!asomo || asomo.anim) return;
    const g = asomo;
    g.anim = true;
    animar(g, g.P0, 400, false).then(() => { if (asomo === g) asomo = null; });
  }

  escenario.addEventListener("pointerdown", (e) => {
    // con el dedo, la hoja solo se pasa con los botones: así el dedo queda libre
    // para acercar y mover el libro con zoom normal
    if (e.pointerType === "touch") return;
    if (e.button !== 0 || e.target.closest("button, a, nav")) return;
    const r = libro.getBoundingClientRect();
    if (e.clientX < r.left - 30 || e.clientX > r.right + 30 || e.clientY < r.top || e.clientY > r.bottom) return;
    const medio = r.left + r.width / 2;
    toque = {
      x: e.clientX,
      y: e.clientY,
      tiempo: performance.now(),
      dir: e.clientX >= medio ? 1 : -1,
      arriba: e.clientY < r.top + r.height / 2,
      arrastre: false,
      id: e.pointerId,
    };
  });

  escenario.addEventListener("pointermove", (e) => {
    if (!toque) {
      if (e.pointerType === "mouse" && e.buttons === 0) asomar(e);
      return;
    }
    if (e.pointerId !== toque.id) return;
    const dx = e.clientX - toque.x;
    if (!toque.arrastre) {
      if (Math.abs(dx) < 6 && Math.abs(e.clientY - toque.y) < 6) return;
      if (asomo && asomo.dir === toque.dir && !asomo.anim) {
        giro = asomo;
        asomo = null;
      } else {
        if (giro || !destino(toque.dir)) {
          toque = null;
          return;
        }
        giro = crearGiro(toque.dir, toque.arriba, false);
      }
      toque.arrastre = true;
      toque.Pini = giro.P;
      try { escenario.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
      sonar(0.5);
    }
    if (!giro || !giro.fijar) return;
    const k = 1.25;
    giro.fijar([toque.Pini[0] + giro.s * dx * k, toque.Pini[1] + (e.clientY - toque.y) * k]);
  });

  function soltar(e) {
    if (!toque || e.pointerId !== toque.id) return;
    const t = toque;
    toque = null;
    if (!t.arrastre) {
      if (e.type === "pointerup" && performance.now() - t.tiempo < 500) voltear(t.dir);
      return;
    }
    if (!giro || !giro.fijar) return;
    const dx = e.clientX - t.x;
    const vel = Math.abs(dx) / Math.max(1, performance.now() - t.tiempo);
    const haciaFin = Math.sign(giro.P1[0] - giro.P0[0]) * giro.s === Math.sign(dx);
    const completo = e.type === "pointerup" && (giro.avance() > 0.35 || (vel > 0.5 && haciaFin));
    if (completo) giro.centrar();
    animar(giro, completo ? giro.P1 : giro.P0, 750, completo);
  }
  escenario.addEventListener("pointerup", soltar);
  escenario.addEventListener("pointercancel", soltar);

  // con el mouse cerca de la esquina, la hoja se levanta un poco
  function asomar(e) {
    if (giro || innerWidth <= 700) return;
    const r = libro.getBoundingClientRect();
    const zona = Math.min(90, ancho * 0.22);
    const enDer = e.clientX > r.right - zona && e.clientX <= r.right + 10;
    const enIzq = doble && e.clientX < r.left + zona && e.clientX >= r.left - 10;
    const arriba = e.clientY < r.top + zona && e.clientY >= r.top - 10;
    const abajo = e.clientY > r.bottom - zona && e.clientY <= r.bottom + 10;
    const dir = enDer && (arriba || abajo) && destino(1) ? 1 : enIzq && (arriba || abajo) && destino(-1) ? -1 : 0;

    if (asomo && (asomo.dir !== dir || asomo.arriba !== arriba)) cancelarAsomo();
    if (!dir || (asomo && asomo.anim)) return;
    if (!asomo) {
      asomo = crearGiro(dir, arriba, false);
      if (!asomo) return;
      asomo.arriba = arriba;
    }
    const P = enGiro(e, r, asomo.s);
    const C = asomo.C;
    // la esquina sigue al mouse, pero sin pasar de un pequeño levantamiento
    const v = resta(P, C);
    const l = largo(v);
    const max = zona * 0.9;
    asomo.fijar(l > max ? [C[0] + (v[0] / l) * max, C[1] + (v[1] / l) * max] : P);
  }
  escenario.addEventListener("pointerleave", () => cancelarAsomo());

  /* ---------- Interfaz ---------- */

  function visiblesTexto() {
    const v = vista();
    if (v.izq && v.der) return `${v.izq}–${v.der} / ${total}`;
    return `${v.izq || v.der} / ${total}`;
  }

  function actualizarUI() {
    const v = vista();
    const ref = v.der || v.izq;
    contador.textContent = visiblesTexto();
    deslizador.value = ref;
    deslizador.style.setProperty("--avance", `${((ref - 1) / Math.max(1, total - 1)) * 100}%`);
    $("btnAnt").disabled = $("btnAntBarra").disabled = !destino(-1);
    $("btnSig").disabled = $("btnSigBarra").disabled = !destino(1);
    history.replaceState(null, "", `#p=${pagina}`);

    let activa = -1;
    secciones.forEach((s, i) => { if (s.pagina <= ref) activa = i; });
    document.querySelectorAll(".pestana").forEach((b, i) => b.classList.toggle("activa", i === activa));
    document.querySelectorAll(".mini").forEach((b) => {
      const n = +b.dataset.n;
      b.classList.toggle("actual", n === v.izq || n === v.der);
    });
  }

  function crearPestanas() {
    const nav = $("pestanas");
    for (const s of secciones) {
      const b = document.createElement("button");
      b.className = "pestana";
      b.style.setProperty("--c", s.color);
      b.innerHTML = `<b></b><span></span>`;
      b.querySelector("b").textContent = s.numero;
      b.querySelector("span").textContent = s.nombre;
      b.setAttribute("aria-label", `Sección ${s.numero}: ${s.nombre}`);
      b.addEventListener("click", () => irA(s.pagina));
      nav.appendChild(b);
    }
  }

  function crearMinis() {
    const rejilla = $("minisRejilla");
    if (rejilla.childElementCount) return;
    rejilla.style.setProperty("--proporcion", proporcion);
    for (let n = 1; n <= total; n++) {
      const b = document.createElement("button");
      b.className = "mini";
      b.dataset.n = n;
      b.innerHTML = `<img loading="lazy" decoding="async" alt=""><span>${n}</span>`;
      b.querySelector("img").src = rutaMini(n);
      b.setAttribute("aria-label", `Ir a la página ${n}`);
      b.addEventListener("click", () => {
        irA(n);
        alternarMinis(false);
      });
      rejilla.appendChild(b);
    }
  }

  function alternarMinis(abrir) {
    const panel = $("minis");
    abrir = abrir ?? panel.hidden;
    if (abrir) crearMinis();
    panel.hidden = !abrir;
    $("btnMinis").setAttribute("aria-pressed", abrir);
    if (abrir) {
      actualizarUI();
      panel.querySelector(".mini.actual")?.scrollIntoView({ block: "nearest" });
    }
  }

  function abrirZoom() {
    const v = vista();
    const cont = $("zoomContenido");
    cont.replaceChildren();
    const ns = [v.izq, v.der].filter(valida);
    for (const n of ns) {
      const im = document.createElement("img");
      im.src = ruta(n);
      im.alt = `Página ${n}`;
      im.style.width = `min(1188px, ${92 / ns.length}vw)`;
      im.addEventListener("click", cerrarZoom);
      cont.appendChild(im);
    }
    $("zoom").hidden = false;
    $("zoom").scrollTo(0, 0);
  }
  function cerrarZoom() { $("zoom").hidden = true; }

  /* ---------- Sonido de hoja (sintetizado, sin archivos) ---------- */

  let audio = null;
  function sonar(volumen = 1) {
    if (!sonido) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const dur = 0.32;
      const buf = audio.createBuffer(1, audio.sampleRate * dur, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        d[i] = (Math.random() * 2 - 1) * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 2) * (1 - t * 0.5);
      }
      const src = audio.createBufferSource();
      src.buffer = buf;
      const filtro = audio.createBiquadFilter();
      filtro.type = "bandpass";
      filtro.frequency.value = 2400;
      filtro.Q.value = 0.7;
      const gan = audio.createGain();
      gan.gain.value = 0.22 * volumen;
      src.connect(filtro).connect(gan).connect(audio.destination);
      src.start();
    } catch { /* sin audio */ }
  }

  function pintarModo() {
    const b = $("btnModo");
    const dos = modo === "doble";
    b.setAttribute("aria-pressed", dos);
    b.setAttribute("aria-label", dos ? "Ver una página" : "Ver dos páginas");
    b.title = dos ? "Ver una página" : "Ver dos páginas";
  }

  function pintarSonido() {
    const b = $("btnSonido");
    b.setAttribute("aria-pressed", sonido);
    b.setAttribute("aria-label", sonido ? "Silenciar" : "Activar sonido");
  }

  /* ---------- Eventos ---------- */

  $("btnAnt").addEventListener("click", () => voltear(-1));
  $("btnSig").addEventListener("click", () => voltear(1));
  $("btnAntBarra").addEventListener("click", () => voltear(-1));
  $("btnSigBarra").addEventListener("click", () => voltear(1));
  $("btnInicio").addEventListener("click", () => irA(1));
  $("btnMinis").addEventListener("click", () => alternarMinis());
  $("btnZoom").addEventListener("click", abrirZoom);
  $("btnModo").addEventListener("click", () => {
    if (giro) return;
    if (asomo) { asomo.terminar(false); asomo = null; }
    modo = modo === "doble" ? "sencillo" : "doble";
    localStorage.setItem("flip-modo", modo);
    pintarModo();
    medir();
    libro.animate([{ opacity: 0.6, scale: 0.98 }, { opacity: 1, scale: 1 }], { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" });
  });
  $("btnCerrarZoom").addEventListener("click", cerrarZoom);
  // aviso para girar el teléfono: se puede cerrar y no vuelve en esta visita
  if (sessionStorage.getItem("aviso-girar") === "visto") $("avisoGirar").classList.add("cerrado");
  $("avisoCerrar").addEventListener("click", () => {
    $("avisoGirar").classList.add("cerrado");
    sessionStorage.setItem("aviso-girar", "visto");
  });
  $("btnSonido").addEventListener("click", () => {
    sonido = !sonido;
    localStorage.setItem("flip-sonido", sonido ? "1" : "0");
    pintarSonido();
    sonar(0.6);
  });
  /* ---------- Pantalla completa ---------- */
  // El navegador solo deja entrar a pantalla completa después de un toque o clic,
  // así que al girar el teléfono se muestra un aviso: el primer toque la activa.
  const raizDoc = document.documentElement;
  const pedirCompleta = raizDoc.requestFullscreen || raizDoc.webkitRequestFullscreen;
  const salirCompleta = document.exitFullscreen || document.webkitExitFullscreen;
  const enCompleta = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const hayCompleta = !!pedirCompleta && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
  // abierto desde el ícono de la pantalla de inicio ya no tiene barra del navegador
  const comoApp = matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches;
  const tactil = matchMedia("(pointer: coarse)");
  const deLado = matchMedia("(orientation: landscape)");
  const avisoCompleta = $("avisoCompleta");
  if (!hayCompleta || comoApp) document.body.classList.add("sin-completa");

  function alternarCompleta() {
    try {
      if (enCompleta()) salirCompleta.call(document);
      else Promise.resolve(pedirCompleta.call(raizDoc, { navigationUI: "hide" })).catch(() => {});
    } catch {}
  }
  function pintarCompleta() {
    const b = $("btnPantalla");
    const dentro = enCompleta();
    b.setAttribute("aria-pressed", dentro);
    const texto = dentro ? "Salir de pantalla completa" : "Pantalla completa";
    b.setAttribute("aria-label", texto);
    b.title = texto;
    b.querySelector(".etiqueta").textContent = dentro ? "Salir" : "Pantalla completa";
    if (dentro) avisoCompleta.hidden = true;
  }
  function revisarGiro() {
    const toca = hayCompleta && !comoApp && tactil.matches && deLado.matches && !enCompleta()
      && sessionStorage.getItem("aviso-completa") !== "no";
    avisoCompleta.hidden = !toca;
  }
  $("btnPantalla").addEventListener("click", alternarCompleta);
  avisoCompleta.addEventListener("click", (e) => {
    avisoCompleta.hidden = true;
    if (e.target.closest("#completaNo")) sessionStorage.setItem("aviso-completa", "no");
    else alternarCompleta();
  });
  document.addEventListener("fullscreenchange", pintarCompleta);
  document.addEventListener("webkitfullscreenchange", pintarCompleta);
  // al girar a horizontal aparece el aviso; al volver a vertical se quita
  deLado.addEventListener?.("change", revisarGiro);
  revisarGiro();
  deslizador.addEventListener("input", () => {
    contador.textContent = `${deslizador.value} / ${total}`;
  });
  deslizador.addEventListener("change", () => irA(+deslizador.value));

  addEventListener("keydown", (e) => {
    if (e.target.matches("input")) return;
    if (!$("zoom").hidden) {
      if (e.key === "Escape") cerrarZoom();
      return;
    }
    const k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " ") voltear(1);
    else if (k === "ArrowLeft" || k === "PageUp") voltear(-1);
    else if (k === "Home") irA(1);
    else if (k === "End") irA(total);
    else if (k === "Escape") alternarMinis(false);
    else return;
    e.preventDefault();
  });

  let espera;
  addEventListener("resize", () => {
    clearTimeout(espera);
    // con zoom de dos dedos no se reacomoda el libro, para no deshacer el acercamiento
    const conZoom = window.visualViewport && visualViewport.scale > 1.01;
    espera = setTimeout(() => { if (!giro && !asomo && !conZoom) medir(); }, 120);
  });
  addEventListener("hashchange", () => {
    const n = +(location.hash.match(/p=(\d+)/) || [])[1];
    if (n && n !== pagina) irA(n, false);
  });

  /* ---------- Arranque ---------- */

  async function iniciar() {
    try {
      const [info, conf] = await Promise.all([
        fetch("paginas.json", { cache: "no-cache" }).then((r) => r.json()),
        fetch("config.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({})),
      ]);
      total = info.total;
      if (info.version) version = `?v=${info.version}`; // al cambiar el PDF, el teléfono no usa imágenes viejas
      proporcion = info.ancho / info.alto;
      secciones = conf.secciones || [];
      if (conf.titulo) document.title = conf.titulo;
    } catch {
      $("cargando").innerHTML = "<p>No se pudo cargar el manual. Ábrelo desde un servidor web (GitHub Pages o <code>python -m http.server</code>).</p>";
      return;
    }
    deslizador.max = total;
    pagina = limitar(+(location.hash.match(/p=(\d+)/) || [])[1] || 1, 1, total);
    crearPestanas();
    pintarSonido();
    pintarModo();
    medir();
    mostrar();
    const v = vista();
    await listas(v.izq, v.der);
    libro.classList.add("listo");
    $("cargando").classList.add("oculto");
  }

  iniciar();
})();
