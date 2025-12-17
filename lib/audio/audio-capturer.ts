import { APP_CONFIG } from '../constants';
import { createAudioContext } from '../utils';

export interface AudioCapturerOptions {
  sampleRate?: number;
  channels?: number;
  bufferSize?: number;
  onData?: (audioData: Float32Array) => void;
  onError?: (error: string) => void;
}

export class AudioCapturer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrame: number | null = null;
  private options: AudioCapturerOptions;
  private isRecording: boolean = false;

  constructor(options: AudioCapturerOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: options.channels || APP_CONFIG.AUDIO.CHANNELS,
      bufferSize: options.bufferSize || APP_CONFIG.AUDIO.CHUNK_SIZE,
      onData: options.onData,
      onError: options.onError
    };
  }

  /**
   * Initialize audio capture
   */
  async initialize(): Promise<void> {
    try {
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      // Create audio context
      this.audioContext = createAudioContext();

      // Get user media
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.options.sampleRate,
          channelCount: this.options.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create audio nodes
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      
      // Configure analyser
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect nodes
      this.source.connect(this.analyser);

      console.log('Audio capturer initialized successfully');
    } catch (error) {
      const errorMessage = `Failed to initialize audio capturer: ${error}`;
      console.error(errorMessage);
      this.options.onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Start audio capture
   */
  async startCapture(): Promise<void> {
    if (!this.audioContext || !this.mediaStream) {
      throw new Error('Audio capturer not initialized');
    }

    if (this.isRecording) {
      console.warn('Audio capture already in progress');
      return;
    }

    try {
      this.isRecording = true;
      
      // Create media recorder for high-quality audio
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      const audioChunks: Blob[] = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioData = await this.decodeAudioData(arrayBuffer);
        
        if (audioData && this.options.onData) {
          this.options.onData(audioData);
        }
      };

      this.mediaRecorder.start(100); // Collect data every 100ms

      // Start real-time audio analysis
      this.startAudioAnalysis();

      console.log('Audio capture started');
    } catch (error) {
      this.isRecording = false;
      const errorMessage = `Failed to start audio capture: ${error}`;
      console.error(errorMessage);
      this.options.onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Stop audio capture
   */
  stopCapture(): void {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    console.log('Audio capture stopped');
  }

  /**
   * Start real-time audio analysis for visualization
   */
  private startAudioAnalysis(): void {
    if (!this.analyser || !this.isRecording) {
      return;
    }

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const analyze = () => {
      if (!this.isRecording || !this.analyser) {
        return;
      }

      this.analyser.getByteTimeDomainData(dataArray);
      
      // Calculate audio level for visualization
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const sample = (dataArray[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const audioLevel = Math.min(100, rms * 200);

      // Emit audio level for real-time visualization
      if (this.options.onData) {
        // Create a small buffer with the current audio level
        const buffer = new Float32Array(1);
        buffer[0] = audioLevel / 100;
        this.options.onData(buffer);
      }

      this.animationFrame = requestAnimationFrame(analyze);
    };

    analyze();
  }

  /**
   * Decode audio data from ArrayBuffer
   */
  private async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<Float32Array | null> {
    if (!this.audioContext) {
      return null;
    }

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to mono if stereo
      const channelData = audioBuffer.numberOfChannels === 1 
        ? audioBuffer.getChannelData(0)
        : this.mixToMono(audioBuffer);

      return channelData;
    } catch (error) {
      console.error('Error decoding audio data:', error);
      return null;
    }
  }

  /**
   * Mix stereo audio to mono
   */
  private mixToMono(audioBuffer: AudioBuffer): Float32Array {
    const length = audioBuffer.length;
    const result = new Float32Array(length);
    
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        result[i] += channelData[i] / audioBuffer.numberOfChannels;
      }
    }
    
    return result;
  }

  /**
   * Get current audio level (0-100)
   */
  getCurrentAudioLevel(): number {
    if (!this.analyser) {
      return 0;
    }

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const sample = (dataArray[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(100, rms * 200);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopCapture();
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.source = null;
    this.analyser = null;
    this.mediaRecorder = null;
  }
}