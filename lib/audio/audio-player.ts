import { APP_CONFIG } from '../constants';

export interface AudioPlayerOptions {
  sampleRate?: number;
  channels?: number;
  volume?: number;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  autoPlay?: boolean;
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;

  private options: Required<AudioPlayerOptions>;

  private isPlaying: boolean = false;
  private isStreaming: boolean = false;

  private currentSource: AudioBufferSourceNode | null = null;
  private currentAudioBuffer: AudioBuffer | null = null;

  private queue: AudioBuffer[] = [];
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();
  private nextStartTime: number = 0;

  private playbackStartTime: number = 0;
  private pauseOffset: number = 0;

  constructor(options: AudioPlayerOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: options.channels || APP_CONFIG.AUDIO.CHANNELS,
      volume: options.volume ?? 1.0,
      onPlay: options.onPlay || (() => {}),
      onPause: options.onPause || (() => {}),
      onEnded: options.onEnded || (() => {}),
      onError: options.onError || (() => {}),
      autoPlay: options.autoPlay ?? false
    };
  }

  async initialize(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.options.sampleRate
      });

      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.setVolume(this.options.volume);

      console.log('Audio player initialized');
    } catch (error) {
      const errorMessage = `Failed to initialize audio player: ${error}`;
      console.error(errorMessage);
      this.options.onError(errorMessage);
      throw error;
    }
  }

  async loadFromFloat32Array(audioData: Float32Array): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio player not initialized');
    }

    try {
      const audioBuffer = this.audioContext.createBuffer(
        this.options.channels,
        audioData.length,
        this.options.sampleRate
      );

      const channelData = new Float32Array(audioData);

      if (this.options.channels === 1) {
        audioBuffer.copyToChannel(channelData, 0);
      } else {
        for (let channel = 0; channel < this.options.channels; channel++) {
          audioBuffer.copyToChannel(channelData, channel);
        }
      }

      this.currentAudioBuffer = audioBuffer;

      if (this.options.autoPlay) {
        await this.play();
      }
    } catch (error) {
      const errorMessage = `Failed to load audio data: ${error}`;
      console.error(errorMessage);
      this.options.onError(errorMessage);
      throw error;
    }
  }

  async loadFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio player not initialized');
    }

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
      this.currentAudioBuffer = audioBuffer;

      if (this.options.autoPlay) {
        await this.play();
      }
    } catch (error) {
      const errorMessage = `Failed to decode audio data: ${error}`;
      console.error(errorMessage);
      this.options.onError(errorMessage);
      throw error;
    }
  }

  async play(startTime: number = 0): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio player not initialized');
    }

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const wasPlaying = this.isPlaying;

      if (this.queue.length > 0 || this.scheduledSources.size > 0) {
        this.isStreaming = true;
        this.isPlaying = true;
        this.scheduleQueuedBuffers();

        if (!wasPlaying) {
          this.options.onPlay();
        }

        return;
      }

      if (!this.currentAudioBuffer) {
        throw new Error('No audio data loaded or queued');
      }

      this.isStreaming = false;

      this.stop();

      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = this.currentAudioBuffer;
      this.currentSource.connect(this.gainNode!);

      this.currentSource.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
        this.currentAudioBuffer = null;
        this.pauseOffset = 0;
        this.playbackStartTime = 0;
        this.options.onEnded();
      };

      const offset = this.pauseOffset + startTime;
      this.currentSource.start(0, offset);
      this.playbackStartTime = this.audioContext.currentTime - offset;
      this.isPlaying = true;
      this.pauseOffset = 0;

      if (!wasPlaying) {
        this.options.onPlay();
      }
    } catch (error) {
      const errorMessage = `Failed to start playback: ${error}`;
      console.error(errorMessage);
      this.options.onError(errorMessage);
      throw error;
    }
  }

  pause(): void {
    if (!this.audioContext || !this.isPlaying) {
      return;
    }

    try {
      if (this.isStreaming) {
        this.audioContext.suspend().catch(() => {});
        this.isPlaying = false;
        this.options.onPause();
        return;
      }

      this.pauseOffset = this.audioContext.currentTime - this.playbackStartTime;

      if (this.currentSource) {
        this.currentSource.stop();
        this.currentSource = null;
      }

      this.isPlaying = false;
      this.options.onPause();
    } catch (error) {
      console.error('Error pausing playback:', error);
    }
  }

  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
      } catch {
        // ignore
      }
      this.currentSource = null;
    }

    for (const source of this.scheduledSources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // ignore
      }
    }

    this.scheduledSources.clear();
    this.isPlaying = false;
    this.isStreaming = false;
    this.nextStartTime = 0;
    this.pauseOffset = 0;
    this.playbackStartTime = 0;
  }

  setVolume(volume: number): void {
    if (!this.gainNode || !this.audioContext) {
      return;
    }

    this.gainNode.gain.setValueAtTime(
      Math.max(0, Math.min(1, volume)),
      this.audioContext.currentTime
    );
  }

  getVolume(): number {
    return this.gainNode?.gain.value ?? this.options.volume;
  }

  getCurrentTime(): number {
    if (!this.audioContext) {
      return 0;
    }

    if (this.isStreaming) {
      return this.audioContext.currentTime;
    }

    if (this.isPlaying) {
      return this.audioContext.currentTime - this.playbackStartTime;
    }

    return this.pauseOffset;
  }

  getDuration(): number {
    return this.currentAudioBuffer?.duration || 0;
  }

  seek(time: number): void {
    if (!this.currentAudioBuffer || this.isStreaming) {
      return;
    }

    const clampedTime = Math.max(0, Math.min(time, this.getDuration()));

    if (this.isPlaying) {
      this.pauseOffset = clampedTime;
      this.play().catch(() => {});
    } else {
      this.pauseOffset = clampedTime;
    }
  }

  addToQueue(audioBuffer: AudioBuffer): void {
    this.queue.push(audioBuffer);

    if (this.isPlaying) {
      this.isStreaming = true;
      this.scheduleQueuedBuffers();
    }
  }

  private scheduleQueuedBuffers(): void {
    if (!this.audioContext || !this.gainNode) {
      return;
    }

    const now = this.audioContext.currentTime;
    const minStart = now + 0.02;
    if (this.nextStartTime < minStart) {
      this.nextStartTime = minStart;
    }

    while (this.queue.length > 0) {
      const buffer = this.queue.shift()!;

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);

      const startAt = Math.max(this.nextStartTime, this.audioContext.currentTime + 0.02);
      source.start(startAt);
      this.nextStartTime = startAt + buffer.duration;

      this.scheduledSources.add(source);
      source.onended = () => {
        this.scheduledSources.delete(source);

        if (this.scheduledSources.size === 0 && this.queue.length === 0) {
          this.isPlaying = false;
          this.isStreaming = false;
          this.nextStartTime = 0;
          this.options.onEnded();
        }
      };
    }
  }

  clearQueue(): void {
    this.queue = [];
  }

  getStatus(): {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    queueLength: number;
  } {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
      volume: this.getVolume(),
      queueLength: this.queue.length + this.scheduledSources.size
    };
  }

  setPlaybackRate(rate: number): void {
    if (this.currentSource) {
      this.currentSource.playbackRate.setValueAtTime(
        Math.max(0.25, Math.min(4.0, rate)),
        this.audioContext?.currentTime || 0
      );
    }
  }

  setLooping(loop: boolean): void {
    if (this.currentSource) {
      this.currentSource.loop = loop;
    }
  }

  applyFilter(_filterType: BiquadFilterType, _frequency: number, _Q: number = 1): void {
    console.warn('Audio filtering not fully implemented in this version');
  }

  fadeIn(duration: number = 1.0): void {
    if (!this.gainNode || !this.audioContext) {
      return;
    }

    const currentTime = this.audioContext.currentTime;
    this.gainNode.gain.setValueAtTime(0, currentTime);
    this.gainNode.gain.linearRampToValueAtTime(this.getVolume(), currentTime + duration);
  }

  fadeOut(duration: number = 1.0): void {
    if (!this.gainNode || !this.audioContext) {
      return;
    }

    const currentTime = this.audioContext.currentTime;
    this.gainNode.gain.setValueAtTime(this.getVolume(), currentTime);
    this.gainNode.gain.linearRampToValueAtTime(0, currentTime + duration);
  }

  createVisualizationData(): Uint8Array {
    if (!this.audioContext) {
      return new Uint8Array(0);
    }

    const bufferLength = 256;
    const dataArray = new Uint8Array(bufferLength);

    const currentTime = this.getCurrentTime();
    const frequency = 2;
    const amplitude = 0.5;

    for (let i = 0; i < bufferLength; i++) {
      dataArray[i] = Math.floor(
        (Math.sin(currentTime * frequency + i * 0.1) * amplitude + 0.5) * 255
      );
    }

    return dataArray;
  }

  dispose(): void {
    this.stop();
    this.clearQueue();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.currentAudioBuffer = null;
    this.gainNode = null;
  }
}
