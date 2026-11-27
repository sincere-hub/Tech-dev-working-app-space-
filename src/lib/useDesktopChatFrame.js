
import { useLayoutEffect } from 'react';

export default function useDesktopChatFrame(root) {
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;

    const shell = node.closest('.app-shell');
    const page = shell?.querySelector('.page-content');
    const desktop = window.matchMedia('(min-width: 768px)');
    let frame = 0;

    function measure() {
      frame = 0;

      if (!desktop.matches) {
        node.style.removeProperty('--td-pc-chat-top');
        return;
      }

      let bottom = 0;

      for (const selector of [
        '.topbar',
        '.page-navigation',
        '.page-content > .error-banner'
      ]) {
        const element = shell?.querySelector(selector);
        if (!element || !element.getClientRects().length) continue;
        bottom = Math.max(bottom, element.getBoundingClientRect().bottom);
      }

      const next = Math.ceil(Math.max(0, bottom) + 8) + 'px';

      if (node.style.getPropertyValue('--td-pc-chat-top') !== next) {
        node.style.setProperty('--td-pc-chat-top', next);
      }
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    const resize = typeof ResizeObserver === 'function'
      ? new ResizeObserver(schedule)
      : null;

    for (const selector of ['.topbar', '.page-navigation']) {
      const element = shell?.querySelector(selector);
      if (element) resize?.observe(element);
    }

    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(schedule)
      : null;

    if (page) observer?.observe(page, { childList: true });

    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    desktop.addEventListener('change', schedule);

    measure();

    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      desktop.removeEventListener('change', schedule);
      node.style.removeProperty('--td-pc-chat-top');
    };
  }, [root]);
}
