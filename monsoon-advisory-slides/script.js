(function () {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const dots = Array.from(document.querySelectorAll(".dot"));
  let index = 0;

  function goTo(next) {
    if (next < 0 || next >= slides.length || next === index) return;
    slides[index].classList.remove("is-active");
    dots[index].classList.remove("is-active");
    index = next;
    slides[index].classList.add("is-active");
    dots[index].classList.add("is-active");
  }

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      goTo(Number(dot.dataset.go));
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
      e.preventDefault();
      goTo(index + 1);
    }
    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goTo(index - 1);
    }
    if (e.key === "Home") goTo(0);
    if (e.key === "End") goTo(slides.length - 1);
  });

  let touchX = null;
  window.addEventListener(
    "touchstart",
    (e) => {
      touchX = e.changedTouches[0].screenX;
    },
    { passive: true }
  );
  window.addEventListener(
    "touchend",
    (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].screenX - touchX;
      if (Math.abs(dx) > 50) goTo(dx < 0 ? index + 1 : index - 1);
      touchX = null;
    },
    { passive: true }
  );
})();
