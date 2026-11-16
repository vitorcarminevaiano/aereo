import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/space-grotesk';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'lenis/dist/lenis.css';
import './style.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createScene, WAYPOINTS } from './scene.js';

gsap.registerPlugin(ScrollTrigger);
document.body.classList.add('is-loading');
history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const isTouch = window.matchMedia('(hover: none)').matches;

/* ------------------------------------------------------------------ */
/*  Smooth scroll                                                      */
/* ------------------------------------------------------------------ */
const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
lenis.stop();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    const el = id === '#top' ? 0 : $(id);
    if (el === null) return;
    e.preventDefault();
    lenis.scrollTo(el, { duration: 2.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
  });
});

/* ------------------------------------------------------------------ */
/*  Loader: jet engine spool-up                                         */
/* ------------------------------------------------------------------ */
const fan = $('.engine-fan');
const NS = 'http://www.w3.org/2000/svg';
for (let i = 0; i < 24; i++) {
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M200 160 C 206 130, 216 80, 228 42 L 210 38 C 200 80, 194 126, 192 160 Z');
  p.setAttribute('fill', 'url(#blade)');
  p.setAttribute('transform', `rotate(${(i / 24) * 360} 200 200)`);
  fan.appendChild(p);
}
const spinnerG = $('.engine-spinner');
const blurC = $('.engine-blur');
const pctEl = $('.loader-pct');
const stepEl = $('.loader-step');
const barEl = $('.loader-bar i');
const steps = [[0, 'Avvio APU'], [18, 'Accensione'], [42, 'Spool-up N1'], [70, 'Check sistemi'], [92, 'Pronti al decollo']];

const load = { p: 0, rot: 0 };
let ready = false;
const spin = () => {
  const speed = 0.4 + load.p * 0.22; // deg per frame-ish
  load.rot = (load.rot + speed * 1.6) % 360;
  fan.setAttribute('transform', `rotate(${load.rot} 200 200)`);
  spinnerG.setAttribute('transform', `rotate(${load.rot} 200 200)`);
  blurC.setAttribute('opacity', Math.max(0, (load.p - 45) / 55).toFixed(2));
};
gsap.ticker.add(spin);

const loaderTl = gsap.timeline({ paused: true });
loaderTl.to(load, {
  p: 92, duration: 2.6, ease: 'power2.inOut',
  onUpdate: () => {
    pctEl.textContent = String(Math.round(load.p)).padStart(3, '0');
    barEl.style.transform = `scaleX(${load.p / 100})`;
    stepEl.textContent = steps.filter((s) => load.p >= s[0]).pop()[1];
  },
});
loaderTl.play();

/* ------------------------------------------------------------------ */
/*  3D scene                                                           */
/* ------------------------------------------------------------------ */
const sceneApi = createScene($('#webgl'));
const { state, telemetry } = sceneApi;

// waypoint labels
const labelsWrap = $('.wp-labels');
const labels = WAYPOINTS.map((w) => {
  const el = document.createElement('div');
  el.className = 'wp-label';
  el.innerHTML = `${w.name}<small>${w.code}</small>`;
  labelsWrap.appendChild(el);
  return el;
});
sceneApi.setLabels(labels);

Promise.all([document.fonts.ready, new Promise((r) => setTimeout(r, 2700))]).then(() => {
  try { sceneApi.compile(); } catch (e) { /* ignore */ }
  ready = true;
  finishLoader();
});

function finishLoader() {
  gsap.to(load, {
    p: 100, duration: 0.6, ease: 'power2.out',
    onUpdate: () => {
      pctEl.textContent = String(Math.round(load.p)).padStart(3, '0');
      barEl.style.transform = `scaleX(${load.p / 100})`;
      stepEl.textContent = 'Pronti al decollo';
    },
    onComplete: exitLoader,
  });
}

function exitLoader() {
  const tl = gsap.timeline({
    onComplete: () => {
      $('#loader').remove();
      gsap.ticker.remove(spin);
      document.body.classList.remove('is-loading');
      lenis.start();
      ScrollTrigger.refresh();
    },
  });
  tl.to('.loader-top, .loader-bottom', { opacity: 0, duration: 0.4 })
    .to('.engine-svg', { scale: 9, duration: 1.3, ease: 'power3.in' }, 0.1)
    .to('#loader', { backgroundColor: 'rgba(7,11,20,0)', duration: 0.5 }, 0.9)
    .to('.engine-svg', { opacity: 0, duration: 0.35 }, 1.05)
    .to('#webgl', { opacity: 1, duration: 0.8 }, 0.8)
    .to(state, { intro: 1, duration: 2.6, ease: 'expo.out' }, 0.85)
    .from('.hero-title .line > span', { yPercent: 110, duration: 1.4, ease: 'expo.out', stagger: 0.12 }, 1.05)
    .from('.reveal-up', { y: 30, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 }, 1.25)
    .from('.nav', { y: -30, opacity: 0, duration: 1, ease: 'expo.out' }, 1.3)
    .add(() => $('.hud').classList.add('is-on'), 1.5);
}

/* ------------------------------------------------------------------ */
/*  Scroll → 3D state                                                  */
/* ------------------------------------------------------------------ */
ScrollTrigger.create({
  trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true,
  onUpdate: (s) => { state.hero = s.progress; },
});

const panels = $$('.panel');
const wpP = sceneApi.waypointProgress;
const flightBar = $('.hud-progress i');
ScrollTrigger.create({
  trigger: '.flight', start: 'top bottom', end: 'bottom bottom', scrub: true,
  onUpdate: (s) => {
    // first 100vh of the section is the hero leaving; flight starts once sticky
    const total = s.end - s.start;
    const vh = window.innerHeight;
    const p = Math.max(0, (s.scroll() - s.start - vh) / (total - vh));
    state.flight = p;
    flightBar.style.transform = `scaleY(${p})`;
    panels.forEach((el) => {
      const i = +el.dataset.wp;
      const at = wpP[i];
      const start = i === 4 ? at - 0.13 : at - 0.11;
      const end = i === 4 ? 1.01 : at + 0.07;
      el.classList.toggle('is-active', p > start && p < end);
    });
  },
});

ScrollTrigger.create({
  trigger: '.cta', start: 'top bottom', end: 'bottom bottom', scrub: true,
  onUpdate: (s) => { state.outro = s.progress; },
});

// HUD hidden over the cream sections
ScrollTrigger.create({
  trigger: '.hscroll', start: 'top 60%', endTrigger: 'body', end: 'bottom bottom',
  onToggle: (s) => $('.hud').classList.toggle('is-on', !s.isActive),
});

// telemetry text
const hud = { lat: $('.hud-lat'), lon: $('.hud-lon'), alt: $('.hud-alt'), gs: $('.hud-gs'), hdg: $('.hud-hdg') };
gsap.ticker.add(() => {
  hud.lat.textContent = `${telemetry.lat.toFixed(4)} N`;
  hud.lon.textContent = `${telemetry.lon.toFixed(4)} E`;
  hud.alt.textContent = String(Math.max(0, telemetry.alt)).padStart(5, '0');
  hud.gs.textContent = String(Math.max(0, telemetry.gs)).padStart(3, '0');
  hud.hdg.textContent = String(telemetry.hdg).padStart(3, '0');
});

/* ------------------------------------------------------------------ */
/*  Horizontal routes                                                  */
/* ------------------------------------------------------------------ */
const hSection = $('.hscroll');
const track = $('.h-track');
const cards = $$('.route-card');
function sizeHorizontal() {
  const dist = track.scrollWidth - window.innerWidth;
  hSection.style.height = `${dist + window.innerHeight}px`;
  return dist;
}
let hDist = sizeHorizontal();
ScrollTrigger.create({
  trigger: hSection, start: 'top top', end: 'bottom bottom', scrub: true,
  onRefreshInit: () => { hDist = sizeHorizontal(); },
  onUpdate: (s) => {
    const x = -s.progress * hDist;
    track.style.transform = `translate3d(${x}px,0,0)`;
    const cx = window.innerWidth / 2;
    cards.forEach((c) => {
      const r = c.getBoundingClientRect();
      const d = (r.left + r.width / 2 - cx) / window.innerWidth;
      c.style.transform = `rotate(${(d * 4).toFixed(2)}deg) translateY(${(Math.abs(d) * 40).toFixed(1)}px)`;
    });
  },
});

/* ------------------------------------------------------------------ */
/*  Text reveals & counters                                            */
/* ------------------------------------------------------------------ */
function splitWords(el) {
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span'); w.className = 'w';
          const wi = document.createElement('span'); wi.className = 'wi'; wi.textContent = part;
          w.appendChild(wi); frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  walk(el);
  return $$('.wi', el);
}
$$('.split').forEach((el) => {
  const words = splitWords(el);
  gsap.from(words, {
    yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.045,
    scrollTrigger: { trigger: el, start: 'top 85%', containerAnimation: undefined },
  });
});

$$('.exp-card').forEach((el, i) => {
  gsap.from(el, { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', delay: i * 0.08, scrollTrigger: { trigger: '.exp-grid', start: 'top 85%' } });
});

$$('[data-count]').forEach((el) => {
  const target = +el.dataset.count;
  const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
  const o = { v: 0 };
  el.textContent = `${pre}0${suf}`;
  gsap.to(o, {
    v: target, duration: 2, ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 90%' },
    onUpdate: () => { el.textContent = `${pre}${Math.round(o.v)}${suf}`; },
  });
});

gsap.from('.booking, .club', { y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.booking', start: 'top 90%' } });

// parallax footer word
gsap.fromTo('.footer-big', { yPercent: 40 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });

// marquee speeds with scroll velocity
const mq = $('.marquee-track');
lenis.on('scroll', ({ velocity }) => {
  mq.style.animationDuration = `${Math.max(8, 34 - Math.abs(velocity) * 2)}s`;
});

/* ------------------------------------------------------------------ */
/*  Cursor, magnetic buttons, mouse parallax                           */
/* ------------------------------------------------------------------ */
const cursor = $('.cursor');
const cpos = { x: innerWidth / 2, y: innerHeight / 2 };
const xTo = gsap.quickTo(cursor, 'x', { duration: 0.45, ease: 'power3' });
const yTo = gsap.quickTo(cursor, 'y', { duration: 0.45, ease: 'power3' });
window.addEventListener('pointermove', (e) => {
  cpos.x = e.clientX; cpos.y = e.clientY;
  if (!isTouch) { xTo(e.clientX); yTo(e.clientY); }
  state.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
$$('a, button, select, input, .route-card, .exp-card').forEach((el) => {
  el.addEventListener('pointerenter', () => cursor.classList.add('is-hover'));
  el.addEventListener('pointerleave', () => cursor.classList.remove('is-hover'));
});
if (!isTouch) {
  $$('.magnetic').forEach((el) => {
    const mx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    const my = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      mx((e.clientX - r.left - r.width / 2) * 0.35);
      my((e.clientY - r.top - r.height / 2) * 0.35);
    });
    el.addEventListener('pointerleave', () => { mx(0); my(0); });
  });
}

/* ------------------------------------------------------------------ */
/*  Booking form (demo)                                                */
/* ------------------------------------------------------------------ */
const form = $('.booking');
const msg = $('.booking-msg');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msg.textContent = 'Inserisci un indirizzo email valido.';
    gsap.fromTo(form, { x: -8 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
    return;
  }
  const rotta = form.rotta.value.split('·')[0].trim();
  msg.textContent = `✦ Richiesta ricevuta: ${rotta}, ${form.luce.value.toLowerCase()}. Ti scriveremo all'apertura dei posti (demo).`;
  form.reset();
});
$('.club-btn').addEventListener('click', (e) => {
  e.preventDefault();
  msg.textContent = '✦ Benvenuto nel Club Altura: il tuo primo volo fotografico ti aspetta (demo).';
});

window.addEventListener('resize', () => ScrollTrigger.refresh());
