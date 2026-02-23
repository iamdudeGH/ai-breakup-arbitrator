// ===== PARTICLE SYSTEM =====
(function createParticles() {
  const container = document.getElementById('particles');
  const count = 50;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${Math.random() * 3 + 1}px;
      height: ${Math.random() * 3 + 1}px;
      animation-duration: ${Math.random() * 15 + 10}s;
      animation-delay: ${Math.random() * 15}s;
      opacity: ${Math.random() * 0.5};
    `;
    container.appendChild(p);
  }
})();

// ===== SMOOTH REVEAL ON SCROLL =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.step-card, .tech-card, .asset-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// ===== DEMO FLOW =====
let currentPanel = 0;
const totalPanels = 5;

function showDemo() {
  document.getElementById('demo').scrollIntoView({ behavior: 'smooth' });
}

function changePanel(dir) {
  const panels = document.querySelectorAll('.demo-panel');
  const steps = document.querySelectorAll('.prog-step');
  const lines = document.querySelectorAll('.prog-line');

  panels[currentPanel].classList.remove('active');
  steps[currentPanel].classList.remove('active');
  steps[currentPanel].classList.add('done');

  currentPanel = Math.max(0, Math.min(totalPanels - 1, currentPanel + dir));

  panels[currentPanel].classList.add('active');

  // Update progress steps
  steps.forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i < currentPanel) s.classList.add('done');
    if (i === currentPanel) s.classList.add('active');
  });

  // Update progress lines
  lines.forEach((l, i) => {
    l.classList.toggle('done', i < currentPanel);
  });

  // Update counter
  document.getElementById('current-panel').textContent = currentPanel + 1;

  // Update nav buttons
  document.getElementById('prev-btn').disabled = currentPanel === 0;
  const nextBtn = document.getElementById('next-btn');
  if (currentPanel === totalPanels - 1) {
    nextBtn.textContent = '🔄 Restart';
    nextBtn.onclick = () => {
      currentPanel = -1;
      changePanel(1);
    };
  } else {
    nextBtn.textContent = 'Next →';
    nextBtn.onclick = () => changePanel(1);
  }

  // Special animation for verdict panel
  if (currentPanel === 4) {
    animateVerdict();
  }
}

// ===== DELIBERATION ANIMATION =====
function startDeliberation() {
  if (currentPanel !== 3) return;
  const steps = document.querySelectorAll('.think-step');
  const nodes = document.querySelectorAll('.node');

  let stepIdx = 0;
  let nodeIdx = 0;

  const stepInterval = setInterval(() => {
    if (stepIdx < steps.length) {
      steps[stepIdx].classList.remove('active');
      steps[stepIdx].classList.add('done');
      stepIdx++;
      if (stepIdx < steps.length) steps[stepIdx].classList.add('active');
    } else {
      clearInterval(stepInterval);
    }
  }, 800);

  const nodeInterval = setInterval(() => {
    if (nodeIdx < nodes.length) {
      nodes[nodeIdx].classList.remove('pulsing');
      nodes[nodeIdx].classList.add('active');
      nodeIdx++;
      if (nodeIdx < nodes.length) nodes[nodeIdx].classList.add('pulsing');
    } else {
      clearInterval(nodeInterval);
    }
  }, 600);
}

// ===== VERDICT ANIMATION =====
function animateVerdict() {
  const items = document.querySelectorAll('.verdict-item');
  items.forEach((item, i) => {
    item.style.opacity = '0';
    item.style.transform = 'translateX(-20px)';
    setTimeout(() => {
      item.style.transition = 'all 0.4s ease';
      item.style.opacity = '1';
      item.style.transform = 'translateX(0)';
    }, i * 180);
  });
}

// Watch for deliberation panel
const panelObserver = new MutationObserver(() => {
  const panel3 = document.getElementById('panel-3');
  if (panel3.classList.contains('active')) {
    setTimeout(startDeliberation, 400);
  }
});
panelObserver.observe(document.getElementById('panel-3'), { attributes: true, attributeFilter: ['class'] });

// ===== HEADER SCROLL EFFECT =====
window.addEventListener('scroll', () => {
  const header = document.querySelector('.header');
  if (window.scrollY > 50) {
    header.style.background = 'rgba(7,7,16,0.95)';
  } else {
    header.style.background = 'rgba(7,7,16,0.85)';
  }
});

// ===== STEP CARD STAGGER (already handled by CSS observer above) =====
// Stagger delays
document.querySelectorAll('.step-card').forEach((card, i) => {
  card.style.transitionDelay = `${i * 0.07}s`;
});
document.querySelectorAll('.tech-card').forEach((card, i) => {
  card.style.transitionDelay = `${i * 0.07}s`;
});
document.querySelectorAll('.asset-card').forEach((card, i) => {
  card.style.transitionDelay = `${i * 0.06}s`;
});

// ===== CLICK PROG STEPS =====
document.querySelectorAll('.prog-step').forEach((step, idx) => {
  step.addEventListener('click', () => {
    const diff = idx - currentPanel;
    if (diff !== 0) changePanel(diff);
  });
});

console.log('%c⚖️ AI Breakup Arbitrator', 'color:#a78bfa;font-size:1.2rem;font-weight:bold;');
console.log('%cPowered by GenLayer Intelligent Contracts', 'color:#94a3b8;');
