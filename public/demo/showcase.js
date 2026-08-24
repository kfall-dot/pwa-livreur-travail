(function initTraceoShowcase() {
  const root = document.querySelector('[data-showcase]')
  if (!root) return

  const slides = Array.from(root.querySelectorAll('[data-slide]'))
  const dots = Array.from(document.querySelectorAll('[data-dot]'))
  const prevBtn = document.querySelector('[data-prev]')
  const nextBtn = document.querySelector('[data-next]')
  const counter = document.querySelector('[data-counter]')
  let index = 0
  let touchStartX = 0

  function render() {
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === index)
      slide.setAttribute('aria-hidden', i === index ? 'false' : 'true')
    })
    dots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index)
      dot.setAttribute('aria-current', i === index ? 'true' : 'false')
    })
    if (prevBtn) prevBtn.disabled = index === 0
    if (nextBtn) nextBtn.disabled = index === slides.length - 1
    if (counter) {
      counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`
    }
  }

  function goTo(nextIndex) {
    index = Math.max(0, Math.min(slides.length - 1, nextIndex))
    render()
  }

  prevBtn?.addEventListener('click', () => goTo(index - 1))
  nextBtn?.addEventListener('click', () => goTo(index + 1))
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)))

  root.addEventListener(
    'touchstart',
    (event) => {
      touchStartX = event.changedTouches[0]?.clientX ?? 0
    },
    { passive: true },
  )

  root.addEventListener(
    'touchend',
    (event) => {
      const touchEndX = event.changedTouches[0]?.clientX ?? 0
      const delta = touchEndX - touchStartX
      if (Math.abs(delta) < 48) return
      if (delta < 0) goTo(index + 1)
      else goTo(index - 1)
    },
    { passive: true },
  )

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') goTo(index + 1)
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') goTo(index - 1)
  })

  render()
})()
