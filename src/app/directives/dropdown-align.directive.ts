import { Directive, Input, OnInit, OnDestroy, HostBinding } from '@angular/core';

export type DropdownAlign =
  | 'down'
  | 'down-left'
  | 'down-right'
  | 'up'
  | 'up-left'
  | 'up-right'
  | 'right'
  | 'left';

@Directive({
  selector: '[dropdownAlign]',
  standalone: true
})
export class DropdownAlignDirective implements OnInit, OnDestroy {
  /** Default (mobile-first, all sizes unless overridden). */
  @Input() dropdownAlign: DropdownAlign = 'down';
  /** Override at ≥576px */
  @Input() dropdownAlignSm?: DropdownAlign;
  /** Override at ≥768px */
  @Input() dropdownAlignMd?: DropdownAlign;
  /** Override at ≥992px */
  @Input() dropdownAlignLg?: DropdownAlign;
  /** Override at ≥1200px */
  @Input() dropdownAlignXl?: DropdownAlign;

  @HostBinding('class')
  get alignClass(): string {
    return `dropdown-align-${this.resolve()}`;
  }

  private resizeListener = () => { /* triggers HostBinding re-evaluation */ };

  ngOnInit(): void {
    window.addEventListener('resize', this.resizeListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeListener);
  }

  private resolve(): DropdownAlign {
    const w = window.innerWidth;
    if (w >= 1200 && this.dropdownAlignXl) return this.dropdownAlignXl;
    if (w >= 992  && this.dropdownAlignLg) return this.dropdownAlignLg;
    if (w >= 768  && this.dropdownAlignMd) return this.dropdownAlignMd;
    if (w >= 576  && this.dropdownAlignSm) return this.dropdownAlignSm;
    return this.dropdownAlign;
  }
}
