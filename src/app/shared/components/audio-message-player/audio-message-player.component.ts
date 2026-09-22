import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges
} from '@angular/core';

@Component({
  selector: 'app-audio-message-player',
  standalone: true,
  templateUrl: './audio-message-player.component.html',
  styleUrl: './audio-message-player.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AudioMessagePlayerComponent implements OnInit, OnChanges {
  @Input({ required: true }) src = '';

  private readonly cdr = inject(ChangeDetectorRef);

  currentTime = 0;
  duration = 0;
  playing = false;
  playbackRate: 1 | 1.5 | 2 = 1;
  bars: number[] = [];

  private isDragging = false;

  ngOnInit(): void {
    this.generateWaveform();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['src']) {
      this.generateWaveform();
      this.currentTime = 0;
      this.duration = 0;
      this.playing = false;
    }
  }

  togglePlayback(audio: HTMLAudioElement): void {
    if (audio.paused) {
      void audio.play().catch(() => {
        this.playing = false;
        this.cdr.markForCheck();
      });
    } else {
      audio.pause();
    }
  }

  toggleSpeed(audio: HTMLAudioElement): void {
    if (this.playbackRate === 1) {
      this.playbackRate = 1.5;
    } else if (this.playbackRate === 1.5) {
      this.playbackRate = 2;
    } else {
      this.playbackRate = 1;
    }
    audio.playbackRate = this.playbackRate;
    this.cdr.markForCheck();
  }

  onLoadedMetadata(audio: HTMLAudioElement): void {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      this.duration = audio.duration;
      this.cdr.markForCheck();
    } else if (audio.duration === Infinity) {
      // Fix for WebM recorded voice notes in Chromium where duration is Infinity
      audio.currentTime = 1e101;
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null;
        this.duration = Number.isFinite(audio.duration) ? audio.duration : audio.currentTime;
        audio.currentTime = 0;
        this.cdr.markForCheck();
      };
    }
  }

  onTimeUpdate(audio: HTMLAudioElement): void {
    if (this.isDragging) return;
    this.currentTime = audio.currentTime;
    if (!Number.isFinite(this.duration) || this.duration <= 0 || this.duration < audio.currentTime) {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        this.duration = audio.duration;
      } else {
        this.duration = Math.max(this.duration || 0, audio.currentTime);
      }
    }
    this.cdr.markForCheck();
  }

  onEnded(audio: HTMLAudioElement): void {
    this.playing = false;
    this.currentTime = 0;
    audio.currentTime = 0;
    this.cdr.markForCheck();
  }

  isBarPlayed(index: number): boolean {
    if (!this.duration || this.duration <= 0) return false;
    const progress = this.currentTime / this.duration;
    const barProgress = index / this.bars.length;
    return barProgress <= progress;
  }

  isCurrentBar(index: number): boolean {
    if (!this.playing || !this.duration || this.duration <= 0) return false;
    const currentIndex = Math.floor((this.currentTime / this.duration) * this.bars.length);
    return index === currentIndex;
  }

  startSeeking(audio: HTMLAudioElement, event: MouseEvent): void {
    this.isDragging = true;
    this.applySeek(audio, event.clientX, event.currentTarget as HTMLElement);
  }

  onSeeking(audio: HTMLAudioElement, event: MouseEvent): void {
    if (!this.isDragging) return;
    this.applySeek(audio, event.clientX, event.currentTarget as HTMLElement);
  }

  stopSeeking(): void {
    this.isDragging = false;
  }

  startTouchSeeking(audio: HTMLAudioElement, event: TouchEvent): void {
    if (event.touches.length > 0) {
      this.isDragging = true;
      this.applySeek(audio, event.touches[0].clientX, event.currentTarget as HTMLElement);
    }
  }

  onTouchSeeking(audio: HTMLAudioElement, event: TouchEvent): void {
    if (this.isDragging && event.touches.length > 0) {
      this.applySeek(audio, event.touches[0].clientX, event.currentTarget as HTMLElement);
    }
  }

  private applySeek(audio: HTMLAudioElement, clientX: number, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));

    if (this.duration && this.duration > 0) {
      const targetTime = ratio * this.duration;
      audio.currentTime = targetTime;
      this.currentTime = targetTime;
      this.cdr.markForCheck();
    }
  }

  formatTime(time: number): string {
    if (!Number.isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private generateWaveform(): void {
    const count = 30;
    const seed = this.hashString(this.src || 'perfume_voice_message');
    const result: number[] = [];

    // Predefined pattern envelope for natural voice speech (intro, body with accents, outro)
    const baseEnvelope = [
      30, 42, 60, 38, 75, 90, 68, 85, 100, 72,
      50, 65, 88, 95, 60, 45, 80, 100, 75, 55,
      70, 85, 92, 64, 48, 70, 58, 40, 32, 22
    ];

    for (let i = 0; i < count; i++) {
      const base = baseEnvelope[i] ?? 50;
      // Slight pseudorandom variation per audio URL
      const variation = ((seed * (i + 7) * 1103515245 + 12345) % 25) - 12;
      const height = Math.min(100, Math.max(18, base + variation));
      result.push(height);
    }

    this.bars = result;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
