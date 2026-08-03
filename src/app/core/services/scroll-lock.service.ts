import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private locks = 0;
  private scrollY = 0;
  private previousBody = {
    overflow: '',
    paddingRight: ''
  };
  private previousHtmlOverflow = '';

  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  lock(): void {
    this.locks += 1;
    if (this.locks > 1) return;

    const windowRef = this.document.defaultView;
    const body = this.document.body;
    const html = this.document.documentElement;
    if (!windowRef || !body || !html) return;

    this.scrollY = windowRef.scrollY || html.scrollTop || 0;
    this.previousHtmlOverflow = html.style.overflow;
    this.previousBody = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight
    };

    const scrollbarWidth = Math.max(0, windowRef.innerWidth - html.clientWidth);
    html.classList.add('scroll-locked');
    body.classList.add('scroll-locked');
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  }

  unlock(): void {
    if (this.locks === 0) return;
    this.locks -= 1;
    if (this.locks > 0) return;

    const windowRef = this.document.defaultView;
    const body = this.document.body;
    const html = this.document.documentElement;
    if (!windowRef || !body || !html) return;

    html.classList.remove('scroll-locked');
    body.classList.remove('scroll-locked');
    html.style.overflow = this.previousHtmlOverflow;
    body.style.overflow = this.previousBody.overflow;
    body.style.paddingRight = this.previousBody.paddingRight;
    windowRef.scrollTo(0, this.scrollY);
  }
}
