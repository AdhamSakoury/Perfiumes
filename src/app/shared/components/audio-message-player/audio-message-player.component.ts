import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-audio-message-player',
  standalone: true,
  templateUrl: './audio-message-player.component.html',
  styleUrl: './audio-message-player.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AudioMessagePlayerComponent {
  @Input({ required: true }) src = '';

  currentTime = 0;
  duration = 0;
  playing = false;
  muted = false;
  volume = 1;

  togglePlayback(audio: HTMLAudioElement): void {
    if (audio.paused) {
      void audio.play().catch(() => this.playing = false);
    } else {
      audio.pause();
    }
  }

  seek(audio: HTMLAudioElement, event: Event): void {
    const nextTime = Number((event.target as HTMLInputElement).value);
    audio.currentTime = nextTime;
    this.currentTime = nextTime;
  }

  setVolume(audio: HTMLAudioElement, event: Event): void {
    const nextVolume = Number((event.target as HTMLInputElement).value);
    this.volume = nextVolume;
    this.muted = nextVolume === 0;
    audio.muted = this.muted;
    audio.volume = nextVolume;
  }

  toggleMute(audio: HTMLAudioElement): void {
    this.muted = !this.muted;
    audio.muted = this.muted;
  }

  onLoadedMetadata(audio: HTMLAudioElement): void {
    this.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  }

  onTimeUpdate(audio: HTMLAudioElement): void {
    this.currentTime = audio.currentTime;
  }

  onEnded(audio: HTMLAudioElement): void {
    this.playing = false;
    this.currentTime = 0;
    audio.currentTime = 0;
  }

  formatTime(time: number): string {
    if (!Number.isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}
