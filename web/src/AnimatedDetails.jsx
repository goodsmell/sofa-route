import React, { useLayoutEffect, useRef } from "react";

// 부드럽게 열리고 닫히는 <details>.
// 열림 상태는 부모가 정해서(open/onToggle) 한 번에 하나만 열리게 할 수 있다.
const DURATION = 260,
  EASING = "cubic-bezier(.2,.8,.2,1)";

export default function AnimatedDetails({ open, onToggle, className, children }) {
  const ref = useRef(null),
    anim = useRef(null),
    first = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (first.current) {
      first.current = false;
      el.open = open;
      return;
    }
    if (el.open === open && !anim.current) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const summary = el.querySelector(":scope > summary");
    anim.current?.cancel();
    el.classList.remove("closing");
    // 지금 높이와 목표 높이를 재고(그리기 전이라 화면이 깜빡이지 않는다) 그 사이를 움직인다.
    const from = el.offsetHeight;
    el.open = open;
    const to = el.offsetHeight;
    if (reduce || from === to) {
      anim.current = null;
      return;
    }
    if (!open) {
      el.open = true; // 닫히는 동안 내용이 보이게 열어 둔다
      el.classList.add("closing");
    }
    el.style.overflow = "hidden";
    const a = el.animate(
      { height: [from + "px", to + "px"] },
      { duration: DURATION, easing: EASING },
    );
    anim.current = a;
    a.onfinish = () => {
      anim.current = null;
      el.style.overflow = "";
      el.classList.remove("closing");
      if (!open) el.open = false;
      // 위쪽 칸이 접히면서 연 칸의 제목이 화면 위로 밀려났으면 보이게 끌어온다.
      if (open && summary && summary.getBoundingClientRect().top < 0)
        summary.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    a.oncancel = () => {
      el.style.overflow = "";
      el.classList.remove("closing");
    };
  }, [open]);

  return (
    <details
      ref={ref}
      className={className}
      onClick={(e) => {
        const summary = e.target.closest("summary");
        if (summary && summary.parentElement === ref.current) {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {children}
    </details>
  );
}
