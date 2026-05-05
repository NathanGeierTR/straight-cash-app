import { Directive, Input, HostListener, OnDestroy, ElementRef } from '@angular/core';
import { TooltipAlign, TouchTooltipService } from '../services/touch-tooltip.service';

@Directive({
  selector: '[appTouchTooltip]',
  standalone: true
})
export class TouchTooltipDirective implements OnDestroy {
  @Input('appTouchTooltip') label = '';
  /** Default alignment (mobile-first: applies at all sizes unless overridden). */
  @Input() tooltipAlign: TooltipAlign = 'top';
  /** Override at ≥576px */
  @Input() tooltipAlignSm?: TooltipAlign;
  /** Override at ≥768px */
  @Input() tooltipAlignMd?: TooltipAlign;
  /** Override at ≥992px */
  @Input() tooltipAlignLg?: TooltipAlign;
  /** Override at ≥1200px */
  @Input() tooltipAlignXl?: TooltipAlign;

  constructor(private service: TouchTooltipService, private el: ElementRef<HTMLElement>) {}

  private getRect(): DOMRect {
    return this.el.nativeElement.getBoundingClientRect();
  }

  private resolveAlign(): TooltipAlign {
    const w = window.innerWidth;
    if (w >= 1200 && this.tooltipAlignXl) return this.tooltipAlignXl;
    if (w >= 992  && this.tooltipAlignLg) return this.tooltipAlignLg;
    if (w >= 768  && this.tooltipAlignMd) return this.tooltipAlignMd;
    if (w >= 576  && this.tooltipAlignSm) return this.tooltipAlignSm;
    return this.tooltipAlign;
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (this.label) {
      // Defer tooltip DOM work until after the synthetic click event fires.
      // On iOS Safari, synchronous DOM mutation during touchend cancels the
      // pending click, breaking all button/expand-row handlers.
      const rect = this.getRect();
      const align = this.resolveAlign();
      const label = this.label;
      setTimeout(() => this.service.showOnTap(rect, label, align), 0);
    }
  }

  @HostListener('mouseenter')
  onMouseEnter(): void {
    if (this.label) {
      this.service.showForElement(this.getRect(), this.label, this.resolveAlign());
    }
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.service.hide();
  }

  ngOnDestroy(): void {
    this.service.hide();
  }
}
