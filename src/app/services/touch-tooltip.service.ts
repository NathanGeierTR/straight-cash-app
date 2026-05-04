import { Injectable, OnDestroy } from '@angular/core';

export type TooltipAlign = 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left' | 'top-left';

@Injectable({ providedIn: 'root' })
export class TouchTooltipService implements OnDestroy {
  private el: HTMLSpanElement | null = null;
  private dismissHandler: (() => void) | null = null;

  private ensure(): void {
    if (this.el) return;
    const span = document.createElement('span');
    span.className = 'touch-tooltip';
    span.style.display = 'none';
    document.body.appendChild(span);
    this.el = span;
  }

  private autoHideTimer: ReturnType<typeof setTimeout> | null = null;

  /** Show on tap — displays briefly then auto-hides. Does NOT block the click event. */
  showOnTap(rect: DOMRect, label: string, align: TooltipAlign = 'top'): void {
    this.clearDismissListener();
    if (this.autoHideTimer !== null) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
    this.showForElement(rect, label, align);
    this.autoHideTimer = setTimeout(() => {
      this.autoHideTimer = null;
      this.hide();
    }, 1500);
  }

  showForElement(rect: DOMRect, label: string, align: TooltipAlign = 'top'): void {
    this.ensure();
    const el = this.el!;
    el.textContent = label;
    el.style.display = '';
    el.style.transform = '';

    const gap = 6;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    switch (align) {
      case 'top':
        el.style.left = `${cx}px`;
        el.style.top = `${rect.top - gap}px`;
        el.style.transform = 'translate(-50%, -100%)';
        break;
      case 'top-right':
        el.style.left = `${rect.right}px`;
        el.style.top = `${rect.top - gap}px`;
        el.style.transform = 'translateY(-100%)';
        break;
      case 'right':
        el.style.left = `${rect.right + gap}px`;
        el.style.top = `${cy}px`;
        el.style.transform = 'translateY(-50%)';
        break;
      case 'bottom-right':
        el.style.left = `${rect.right}px`;
        el.style.top = `${rect.bottom + gap}px`;
        el.style.transform = 'none';
        break;
      case 'bottom':
        el.style.left = `${cx}px`;
        el.style.top = `${rect.bottom + gap}px`;
        el.style.transform = 'translateX(-50%)';
        break;
      case 'bottom-left':
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.bottom + gap}px`;
        el.style.transform = 'translateX(-100%)';
        break;
      case 'left':
        el.style.left = `${rect.left - gap}px`;
        el.style.top = `${cy}px`;
        el.style.transform = 'translate(-100%, -50%)';
        break;
      case 'top-left':
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top - gap}px`;
        el.style.transform = 'translate(-100%, -100%)';
        break;
    }
  }

  private clearDismissListener(): void {
    if (this.dismissHandler) {
      document.removeEventListener('touchstart', this.dismissHandler, { capture: true });
      this.dismissHandler = null;
    }
  }

  hide(): void {
    this.clearDismissListener();
    if (this.autoHideTimer !== null) { clearTimeout(this.autoHideTimer); this.autoHideTimer = null; }
    if (this.el) this.el.style.display = 'none';
  }

  ngOnDestroy(): void {
    this.clearDismissListener();
    if (this.autoHideTimer !== null) { clearTimeout(this.autoHideTimer); this.autoHideTimer = null; }
    this.el?.remove();
  }
}
