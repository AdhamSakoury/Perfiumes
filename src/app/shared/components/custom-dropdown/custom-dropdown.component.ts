import { booleanAttribute, Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';

export interface CustomDropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-custom-dropdown',
  standalone: true,
  templateUrl: './custom-dropdown.component.html',
  styleUrl: './custom-dropdown.component.css'
})
export class CustomDropdownComponent {
  @Input() value = '';
  @Input() options: CustomDropdownOption[] = [];
  @Input() placeholder = 'Select';
  @Input() ariaLabel = 'Select option';
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) compact = false;
  @Output() valueChange = new EventEmitter<string>();

  open = false;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  get selectedOption(): CustomDropdownOption | undefined {
    return this.options.find((option) => option.value === this.value);
  }

  toggle(): void {
    if (this.disabled) return;
    this.open = !this.open;
  }

  select(value: string): void {
    if (this.disabled) return;
    const option = this.options.find((item) => item.value === value);
    if (!option || option.disabled) return;
    this.valueChange.emit(value);
    this.open = false;
  }

  close(): void {
    this.open = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open || this.host.nativeElement.contains(event.target as Node)) return;
    this.close();
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.close();
  }
}
